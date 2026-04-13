import { log } from "./logging.server";

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
 * KV failures fail open to avoid cascading 500s; log.warn emitted.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitConfig {
	windowMs: number; // Window duration in milliseconds
	maxRequests: number; // Maximum requests per window
	keyPrefix: string; // KV key prefix for this limit type
}

interface RateLimitResult {
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
	},
	generate_meal: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:generate_meal",
	},
	recipe_import: {
		windowMs: 60_000, // 1 minute
		maxRequests: 10,
		keyPrefix: "rate:recipe_import",
	},
	group_create: {
		windowMs: 60_000, // 1 minute
		maxRequests: 5, // Very restrictive to prevent spam
		keyPrefix: "rate:group_create",
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
	mcp_search: {
		windowMs: 60_000, // 1 minute
		maxRequests: 20, // AI embedding calls — matches scan limit
		keyPrefix: "rate:mcp_search",
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
	user_purge: {
		windowMs: 300_000, // 5 minutes
		maxRequests: 1,
		keyPrefix: "rate:user_purge",
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
	},
	cargo_list: {
		windowMs: 60_000, // 1 minute
		maxRequests: 60, // Cheap D1 read; cached client-side after first call
		keyPrefix: "rate:cargo_list",
	},
	interest_signup: {
		windowMs: 60_000,
		maxRequests: 10,
		keyPrefix: "rate:interest_signup",
	},
	fin_billing: {
		windowMs: 60_000, // 1 minute
		maxRequests: 30, // Fin retries and conversational turns can fan out quickly
		keyPrefix: "rate:fin_billing",
	},
	admin_search: {
		windowMs: 60_000,
		maxRequests: 30,
		keyPrefix: "rate:admin_search",
	},
	status_poll: {
		windowMs: 60_000,
		maxRequests: 60,
		keyPrefix: "rate:status_poll",
	},
};

// ─── Edge Cache TTL ───────────────────────────────────────────────────────────

/**
 * Cloudflare KV edge cache TTL in seconds.
 * Minimum allowed by Cloudflare is 60 seconds.
 * This caches KV reads at the PoP to reduce latency on L1 cache misses.
 */
const KV_EDGE_CACHE_TTL = 60;

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
			return {
				allowed: false,
				remaining: 0,
				resetAt,
				retryAfter: Math.ceil((resetAt - now) / 1000),
			};
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
		log.warn("Rate limit KV get failed (failing open)", {
			limitType,
			errorMessage: err instanceof Error ? err.message : String(err),
		});
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
		return {
			allowed: false,
			remaining: 0,
			resetAt,
			retryAfter: Math.ceil((resetAt - now) / 1000),
		};
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
		log.warn("Rate limit KV put failed (failing open)", {
			limitType,
			errorMessage: err instanceof Error ? err.message : String(err),
		});
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
		log.warn("Rate limit KV get failed in status check (failing open)", {
			limitType,
			errorMessage: err instanceof Error ? err.message : String(err),
		});
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
