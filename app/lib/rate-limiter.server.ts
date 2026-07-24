import { data } from "react-router";
import { log } from "./logging.server";
import { emitRateLimitDenied } from "./telemetry.server";

/**
 * Distributed Rate Limiting using Cloudflare KV + In-Memory Cache
 *
 * Two-tier architecture:
 *   L1: In-memory Map (per isolate, ~5s TTL) — handles burst traffic with zero KV ops
 *   L2: Cloudflare KV (global, eventually consistent) — syncs state across isolates
 *
 * Optimizations over naive KV-per-request:
 *   1. In-memory cache absorbs rapid successive requests (70–90% fewer KV ops)
 *   2. Edge-level cacheTtl on KV reads reduces read latency at PoPs
 *
 * Security: Approximate rate limiting is industry-standard (used by AWS, Stripe, CF).
 * KV's eventual consistency already makes limits approximate across PoPs; the
 * in-memory cache adds at most 5s of extra staleness on top.
 *
 * KV failures: spend-sensitive buckets (`failClosed: true`) deny the request to
 * prevent AI/search spend runaway (SR-002). Other buckets still fail open for
 * availability; log.warn is emitted in both cases.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitConfig {
	windowMs: number; // Window duration in milliseconds
	maxRequests: number; // Maximum requests per window
	keyPrefix: string; // KV key prefix for this limit type
	/**
	 * When true, KV get/put failures deny the request (short retryAfter).
	 * Use for AI / embedding / Vectorize spend paths. Default false (fail-open).
	 */
	failClosed?: boolean;
}

export interface RateLimitResult {
	allowed: boolean; // Whether the request should be allowed
	remaining: number; // Remaining requests in current window
	resetAt: number; // Unix timestamp when window resets
	retryAfter?: number; // Seconds to wait before retrying (if blocked)
}

interface RateLimitWindow {
	count: number; // Current request count
	windowStart: number; // Unix timestamp when window started
}

interface CacheEntry {
	window: RateLimitWindow; // Cached window state
	cachedAt: number; // When this entry was last synced with KV
}

// ─── In-Memory Cache (L1) ─────────────────────────────────────────────────────

/**
 * Module-level cache persists across requests within the same Worker isolate.
 * Each isolate has its own independent cache; isolate recycling clears it.
 */
const LOCAL_CACHE = new Map<string, CacheEntry>();

/** How long cached entries are trusted before falling through to KV. */
const CACHE_TTL_MS = 5_000; // 5 seconds

/** Minimum interval between cache-cleanup sweeps. */
const CLEANUP_INTERVAL_MS = 30_000; // 30 seconds
let lastCleanupAt = 0;

/**
 * Evict stale entries to prevent unbounded memory growth.
 * Called opportunistically on cache misses; lightweight O(n) scan.
 */
function pruneStaleEntries(now: number): void {
	if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
	lastCleanupAt = now;

	// Remove entries that are well past their useful life
	const maxAge = CACHE_TTL_MS + 60_000;
	for (const [key, entry] of LOCAL_CACHE) {
		if (now - entry.cachedAt > maxAge) {
			LOCAL_CACHE.delete(key);
		}
	}
}

// ─── Rate Limit Configurations ────────────────────────────────────────────────

/**
 * Rate limit configurations for different endpoint types
 *
 * Design decisions:
 * - Checkout: 10 req/min - prevents payment spam attacks
 * - Scan: 20 req/min - balances AI cost with user experience
 * - Search: 30 req/10s - prevents vector DB abuse while allowing rapid searches
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
	checkout: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:checkout",
	},
	scan: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:scan",
		failClosed: true,
	},
	search: {
		windowMs: 10_000, // 10 seconds
		maxRequests: 30,
		keyPrefix: "rate:search",
	},
	meal_match: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:meal_match",
		failClosed: true,
	},
	generate_meal: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:generate_meal",
		failClosed: true,
	},
	recipe_import: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:recipe_import",
		failClosed: true,
	},
	copilot_connect: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:copilot_connect",
		failClosed: true,
	},
	copilot: {
		windowMs: 60_000, // 1 minute
		maxRequests: 30,
		keyPrefix: "rate:copilot",
		failClosed: true,
	},
	group_create: {
		windowMs: 60_000, // 1 minute
		maxRequests: 5, // Very restrictive to prevent spam
		keyPrefix: "rate:group_create",
	},
	group_delete: {
		windowMs: 60_000, // 1 minute
		maxRequests: 5,
		keyPrefix: "rate:group_delete",
	},
	group_invite: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:group_invite",
	},
	group_ownership_transfer: {
		windowMs: 60_000, // 1 minute
		maxRequests: 5,
		keyPrefix: "rate:group_ownership_transfer",
	},
	group_membership_exit: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:group_membership_exit",
	},
	mcp_search: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20, // AI embedding calls — matches scan limit
		keyPrefix: "rate:mcp_search",
		failClosed: true,
	},
	mcp_list: {
		windowMs: 60_000, // 1 minute
		maxRequests: 30,
		keyPrefix: "rate:mcp_list",
	},
	mcp_write: {
		windowMs: 60_000, // 1 minute — tighter than reads to guard mutations
		maxRequests: 15,
		keyPrefix: "rate:mcp_write",
	},
	mcp_supply_sync: {
		windowMs: 60_000, // 1 minute — heavy operation (D1 + Vectorize); decoupled from mcp_write
		maxRequests: 8,
		keyPrefix: "rate:mcp_supply_sync",
		failClosed: true,
	},
	mcp_write_per_key: {
		windowMs: 60_000, // 1 minute — per-API-key cap (defends against stolen keys)
		maxRequests: 15,
		keyPrefix: "rate:mcp_write_key",
	},
	credits_transfer: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:credits_transfer",
	},
	inventory_batch: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:inventory_batch",
		failClosed: true,
	},
	automation: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:automation",
	},
	auth_public: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:auth_public",
	},
	/** App Review password login — stricter than magic-link/social. */
	auth_review_login: {
		windowMs: 60_000,
		maxRequests: 5,
		keyPrefix: "rate:auth_review_login",
	},
	/** Cross-IP cap for the single review account (identifier = normalized email). */
	auth_review_login_account: {
		windowMs: 60_000,
		maxRequests: 20,
		keyPrefix: "rate:auth_review_login_acct",
	},
	oauth_authorize: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:oauth_authorize",
	},
	oauth_token: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:oauth_token",
	},
	oauth_register: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:oauth_register",
	},
	oauth_introspect: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:oauth_introspect",
	},
	oauth_revoke: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:oauth_revoke",
	},
	mcp_http: {
		windowMs: 60_000,
		maxRequests: 120,
		keyPrefix: "rate:mcp_http",
	},
	mcp_delegated_read: {
		windowMs: 60_000,
		maxRequests: 20,
		keyPrefix: "rate:mcp_delegated_read",
	},
	mcp_delegated_write: {
		windowMs: 60_000,
		maxRequests: 6,
		keyPrefix: "rate:mcp_delegated_write",
	},
	shared_public: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60,
		keyPrefix: "rate:shared_public",
	},
	shared_toggle: {
		windowMs: 60_000, // 1 minute
		maxRequests: 30,
		keyPrefix: "rate:shared_toggle",
	},
	inventory_mutation: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:inventory_mut",
	},
	meal_mutation: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:meal_mut",
	},
	grocery_mutation: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:grocery_mut",
	},
	settings_mutation: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:settings_mut",
	},
	user_purge: {
		windowMs: 300_000, // 5 minutes
		maxRequests: 1,
		keyPrefix: "rate:user_purge",
	},
	api_key_create: {
		windowMs: 60_000, // 1 minute
		maxRequests: 5, // minting credentials — keep tight
		keyPrefix: "rate:api_key_create",
	},
	avatar_upload: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:avatar_upload",
	},
	org_avatar_upload: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:org_avatar_upload",
	},
	api_export: {
		windowMs: 60_000, // 1 minute
		maxRequests: 30,
		keyPrefix: "rate:api_export",
	},
	api_import: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20,
		keyPrefix: "rate:api_import",
	},
	plan_week: {
		windowMs: 60_000, // 1 minute — expensive AI call, keep tight
		maxRequests: 5,
		keyPrefix: "rate:plan_week",
		failClosed: true,
	},
	cargo_list: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60, // Cheap D1 read; cached client-side after first call
		keyPrefix: "rate:cargo_list",
	},
	meal_list: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60, // Read-only mobile Galley browsing
		keyPrefix: "rate:meal_list",
	},
	/** Mobile `/hub` — 10-way parallel fan-out per call (see H-3); same tier class as cargo_list/meal_list. */
	hub_read: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60,
		keyPrefix: "rate:hub_read",
		failClosed: true,
	},
	/** Mobile `/supply` — read-only, same tier class as cargo_list (see H-4). */
	supply_read: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60,
		keyPrefix: "rate:supply_read",
	},
	interest_signup: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:interest_signup",
	},
	admin_search: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:admin_search",
	},
	admin_list: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:admin_list",
	},
	admin_metrics: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:admin_metrics",
	},
	status_poll: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:status_poll",
		// Fail-open: denying polls during KV outages causes UI timeouts even when
		// the job already completed in D1 (clients treat non-OK polls as pending).
	},
	agent_auth_register: {
		windowMs: 60_000,
		maxRequests: 5,
		keyPrefix: "rate:agent_auth_register",
	},
	agent_auth_claim: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:agent_auth_claim",
	},
	agent_auth_claim_complete: {
		windowMs: 300_000, // 5 minutes — OTP attempt window
		maxRequests: 5,
		keyPrefix: "rate:agent_auth_claim_complete",
	},
	agent_auth_claim_reissue: {
		windowMs: 3_600_000, // 1 hour
		maxRequests: 3,
		keyPrefix: "rate:agent_auth_claim_reissue",
	},
	mcp_write_preclaim: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:mcp_write_preclaim",
	},
	mcp_write_preclaim_per_key: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:mcp_write_preclaim_key",
	},
};

// ─── Edge Cache TTL ───────────────────────────────────────────────────────────

/**
 * Cloudflare KV edge cache TTL in seconds.
 * Minimum allowed by Cloudflare is 60 seconds.
 * This caches KV reads at the PoP to reduce latency on L1 cache misses.
 */
const KV_EDGE_CACHE_TTL = 60;

/** Short retry hint when spend-sensitive buckets fail closed on KV errors. */
const FAIL_CLOSED_RETRY_AFTER_SECONDS = 5;

function failClosedResult(
	now: number,
	limitType: string,
	options?: { emit?: boolean },
): RateLimitResult {
	if (options?.emit !== false) {
		emitRateLimitDenied(limitType, "fail_closed");
	}
	return {
		allowed: false,
		remaining: 0,
		resetAt: now + FAIL_CLOSED_RETRY_AFTER_SECONDS * 1000,
		retryAfter: FAIL_CLOSED_RETRY_AFTER_SECONDS,
	};
}

function limitDeniedResult(
	limitType: string,
	resetAt: number,
	now: number,
): RateLimitResult {
	emitRateLimitDenied(limitType, "limit");
	return {
		allowed: false,
		remaining: 0,
		resetAt,
		retryAfter: Math.ceil((resetAt - now) / 1000),
	};
}

// ─── Core Rate Limiting ───────────────────────────────────────────────────────

/**
 * Check and update rate limit for a given identifier.
 *
 * Flow:
 *   1. Check L1 in-memory cache → if fresh, operate in memory only (0 KV ops)
 *   2. On cache miss, read from KV (L2) with edge cacheTtl
 *   3. Merge local + KV counts (take max to handle multi-isolate scenarios)
 *   4. Write updated count back to KV for cross-isolate visibility
 *
 * @param kv - Cloudflare KV namespace binding
 * @param limitType - Type of rate limit to apply
 * @param identifier - Unique identifier (typically userId or IP)
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkRateLimit(
	kv: KVNamespace,
	limitType: keyof typeof RATE_LIMITS,
	identifier: string,
): Promise<RateLimitResult> {
	const config = RATE_LIMITS[limitType];
	if (!config) {
		throw new Error(`Unknown rate limit type: ${limitType}`);
	}

	const key = `${config.keyPrefix}:${identifier}`;
	const now = Date.now();
	const failClosed = config.failClosed === true;

	// ── Phase 1: In-memory cache (L1) ──────────────────────────────────────
	const cached = LOCAL_CACHE.get(key);
	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		// Check if window has expired
		if (now - cached.window.windowStart >= config.windowMs) {
			// Window expired — start fresh in memory, no KV ops
			LOCAL_CACHE.set(key, {
				window: { count: 1, windowStart: now },
				cachedAt: now,
			});
			return {
				allowed: true,
				remaining: config.maxRequests - 1,
				resetAt: now + config.windowMs,
			};
		}

		// Window still active — check limit
		if (cached.window.count >= config.maxRequests) {
			const resetAt = cached.window.windowStart + config.windowMs;
			return limitDeniedResult(limitType, resetAt, now);
		}

		// Increment in memory only — zero KV operations
		cached.window.count++;
		return {
			allowed: true,
			remaining: config.maxRequests - cached.window.count,
			resetAt: cached.window.windowStart + config.windowMs,
		};
	}

	// ── Phase 2: Cache miss — fall through to KV (L2) ──────────────────────
	pruneStaleEntries(now);

	let kvData: RateLimitWindow | null = null;
	try {
		kvData = await kv.get<RateLimitWindow>(key, {
			type: "json",
			cacheTtl: KV_EDGE_CACHE_TTL,
		});
	} catch (err) {
		log.warn(
			failClosed
				? "Rate limit KV get failed (failing closed)"
				: "Rate limit KV get failed (failing open)",
			{
				limitType,
				errorMessage: err instanceof Error ? err.message : String(err),
			},
		);
		if (failClosed) {
			return failClosedResult(now, limitType);
		}
	}

	// Determine effective window by merging local cache with KV
	let effectiveWindow: RateLimitWindow;

	if (!kvData || now - kvData.windowStart >= config.windowMs) {
		// No active window in KV
		if (cached && now - cached.window.windowStart < config.windowMs) {
			// Local cache has a valid window that KV doesn't — use local
			effectiveWindow = {
				count: cached.window.count,
				windowStart: cached.window.windowStart,
			};
		} else {
			// Truly new window
			effectiveWindow = { count: 0, windowStart: now };
		}
	} else if (cached && cached.window.windowStart === kvData.windowStart) {
		// Same window in both — take the higher count (multi-isolate merge)
		effectiveWindow = {
			count: Math.max(cached.window.count, kvData.count),
			windowStart: kvData.windowStart,
		};
	} else {
		// Different windows or no local data — trust KV
		effectiveWindow = {
			count: kvData.count,
			windowStart: kvData.windowStart,
		};
	}

	// Check if already at limit
	if (effectiveWindow.count >= config.maxRequests) {
		LOCAL_CACHE.set(key, { window: effectiveWindow, cachedAt: now });
		const resetAt = effectiveWindow.windowStart + config.windowMs;
		return limitDeniedResult(limitType, resetAt, now);
	}

	// Increment
	effectiveWindow.count++;

	// Cache the updated state
	LOCAL_CACHE.set(key, { window: effectiveWindow, cachedAt: now });

	// Write updated count to KV for cross-isolate consistency.
	// Every increment is synced so strict limits (e.g. maxRequests: 1)
	// are enforced globally, not just within a single isolate.
	const ttlSeconds = Math.ceil(config.windowMs / 1000) + 10;
	try {
		await kv.put(key, JSON.stringify(effectiveWindow), {
			expirationTtl: ttlSeconds,
		});
	} catch (err) {
		log.warn(
			failClosed
				? "Rate limit KV put failed (failing closed)"
				: "Rate limit KV put failed (failing open)",
			{
				limitType,
				errorMessage: err instanceof Error ? err.message : String(err),
			},
		);
		if (failClosed) {
			// Roll back the optimistic L1 increment so a later success path does not
			// under-count after we denied this request.
			effectiveWindow.count = Math.max(0, effectiveWindow.count - 1);
			LOCAL_CACHE.set(key, { window: effectiveWindow, cachedAt: now });
			return failClosedResult(now, limitType);
		}
	}

	return {
		allowed: true,
		remaining: config.maxRequests - effectiveWindow.count,
		resetAt: effectiveWindow.windowStart + config.windowMs,
	};
}

// ─── Admin / Utility Functions ────────────────────────────────────────────────

/**
 * Reset rate limit for a specific identifier (admin/testing use).
 * Clears both in-memory cache and KV.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param limitType - Type of rate limit to reset
 * @param identifier - Unique identifier to reset
 */
export async function resetRateLimit(
	kv: KVNamespace,
	limitType: keyof typeof RATE_LIMITS,
	identifier: string,
): Promise<void> {
	const config = RATE_LIMITS[limitType];
	if (!config) {
		throw new Error(`Unknown rate limit type: ${limitType}`);
	}

	const key = `${config.keyPrefix}:${identifier}`;
	LOCAL_CACHE.delete(key);
	await kv.delete(key);
}

/**
 * Get current rate limit status without incrementing.
 * Checks in-memory cache first, falls through to KV on miss.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param limitType - Type of rate limit to check
 * @param identifier - Unique identifier to check
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
	kv: KVNamespace,
	limitType: keyof typeof RATE_LIMITS,
	identifier: string,
): Promise<RateLimitResult> {
	const config = RATE_LIMITS[limitType];
	if (!config) {
		throw new Error(`Unknown rate limit type: ${limitType}`);
	}

	const key = `${config.keyPrefix}:${identifier}`;
	const now = Date.now();

	// Check in-memory cache first
	const cached = LOCAL_CACHE.get(key);
	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		if (now - cached.window.windowStart >= config.windowMs) {
			return {
				allowed: true,
				remaining: config.maxRequests,
				resetAt: now + config.windowMs,
			};
		}
		const currentCount = cached.window.count;
		const allowed = currentCount < config.maxRequests;
		const resetAt = cached.window.windowStart + config.windowMs;
		return {
			allowed,
			remaining: Math.max(0, config.maxRequests - currentCount),
			resetAt,
			retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
		};
	}

	// Fall through to KV
	let existingData: RateLimitWindow | null = null;
	try {
		existingData = await kv.get<RateLimitWindow>(key, {
			type: "json",
			cacheTtl: KV_EDGE_CACHE_TTL,
		});
	} catch (err) {
		const failClosed = config.failClosed === true;
		log.warn(
			failClosed
				? "Rate limit KV get failed in status check (failing closed)"
				: "Rate limit KV get failed in status check (failing open)",
			{
				limitType,
				errorMessage: err instanceof Error ? err.message : String(err),
			},
		);
		if (failClosed) {
			return failClosedResult(now, limitType, { emit: false });
		}
	}

	if (!existingData || now - existingData.windowStart >= config.windowMs) {
		return {
			allowed: true,
			remaining: config.maxRequests,
			resetAt: now + config.windowMs,
		};
	}

	const currentCount = existingData.count;
	const allowed = currentCount < config.maxRequests;
	const resetAt = existingData.windowStart + config.windowMs;

	return {
		allowed,
		remaining: Math.max(0, config.maxRequests - currentCount),
		resetAt,
		retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
	};
}

export interface RateLimitResponseOptions {
	includeBodyMetadata?: boolean;
	extraHeaders?: Record<string, string>;
}

/**
 * Standard 429 response for blocked rate-limit checks.
 * Uses dynamic Retry-After from the limiter result (fixes hardcoded "60" bug).
 */
export function rateLimitResponse(
	result: RateLimitResult,
	message = "Too many requests. Please try again later.",
	options?: RateLimitResponseOptions,
) {
	const body: Record<string, unknown> = { error: message };
	if (options?.includeBodyMetadata) {
		body.retryAfter = result.retryAfter;
		body.resetAt = result.resetAt;
	}
	return data(body, {
		status: 429,
		headers: {
			"Retry-After": String(result.retryAfter ?? 60),
			"X-RateLimit-Remaining": "0",
			"X-RateLimit-Reset": String(result.resetAt),
			...options?.extraHeaders,
		},
	});
}
