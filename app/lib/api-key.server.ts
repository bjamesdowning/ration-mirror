import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { data } from "react-router";
import { apiKey as apiKeyTable } from "../db/schema";

const KEY_PREFIX_LENGTH = 17; // "rtn_live_" (9) + 8 chars for lookup
const KEY_SECRET_LENGTH = 32; // 32 hex chars after prefix
const KEY_PREFIX = "rtn_live_";

function generateSecureRandomHex(length: number): string {
	const bytes = new Uint8Array(Math.ceil(length / 2));
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, length);
}

/**
 * Hash a raw API key with SHA-256 for storage/comparison.
 * Works in Cloudflare Workers (Web Crypto).
 */
export async function hashApiKey(secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(secret);
	const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
	const hashArray = new Uint8Array(hashBuffer);
	return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time comparison to avoid timing attacks.
 */
function secureCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

export interface ApiKeyRecord {
	id: string;
	organizationId: string;
	userId: string;
	keyHash: string;
	keyPrefix: string;
	name: string;
	scopes: string;
	lastUsedAt: Date | null;
	createdAt: Date;
}

/**
 * Verify raw API key and return record if valid.
 * Updates last_used_at on success.
 */
export async function verifyApiKey(
	db: D1Database,
	rawKey: string,
): Promise<ApiKeyRecord | null> {
	const prefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
	if (prefix.length < KEY_PREFIX_LENGTH || !rawKey.startsWith(KEY_PREFIX)) {
		return null;
	}

	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(apiKeyTable)
		.where(eq(apiKeyTable.keyPrefix, prefix))
		.limit(1);

	if (!row) return null;

	const hash = await hashApiKey(rawKey);
	if (!secureCompare(hash, row.keyHash)) return null;

	// Fire-and-forget: update lastUsedAt after the response is returned.
	// This eliminates a blocking D1 write from every API request's critical path.
	// waitUntil guarantees the write completes even after the response is sent.
	const now = new Date();
	waitUntil(
		d1
			.update(apiKeyTable)
			.set({ lastUsedAt: now })
			.where(eq(apiKeyTable.id, row.id)),
	);

	return {
		id: row.id,
		organizationId: row.organizationId,
		userId: row.userId,
		keyHash: row.keyHash,
		keyPrefix: row.keyPrefix,
		name: row.name,
		scopes: row.scopes,
		lastUsedAt: row.lastUsedAt,
		createdAt: row.createdAt,
	};
}

/**
 * Supported API key scopes for programmatic access.
 *
 * Legacy `mcp` implies all `mcp:*` scopes — keys created before fine-grained
 * scopes existed continue to work as full-access MCP keys. New keys can be
 * created with one or more narrow `mcp:*` scopes for least-privilege access.
 */
export const API_SCOPES = {
	inventory: "inventory",
	galley: "galley",
	supply: "supply",
	mcp: "mcp",
	"mcp:read": "mcp:read",
	"mcp:inventory:write": "mcp:inventory:write",
	"mcp:galley:write": "mcp:galley:write",
	"mcp:manifest:write": "mcp:manifest:write",
	"mcp:supply:write": "mcp:supply:write",
	"mcp:preferences:write": "mcp:preferences:write",
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

const INVENTORY_SCOPE = API_SCOPES.inventory;

/**
 * Require API key auth and return organizationId for RLS.
 * Use for programmatic API routes (v1 inventory export/import).
 * Throws data() response if missing or invalid.
 */
export async function requireApiKey(
	context: AppLoadContext,
	request: Request,
	requiredScope: string = INVENTORY_SCOPE,
): Promise<{ organizationId: string; apiKeyId: string; scopes: string[] }> {
	const env = (context as { cloudflare: { env: Cloudflare.Env } }).cloudflare
		.env;
	const authHeader = request.headers.get("Authorization");
	const xApiKey = request.headers.get("X-Api-Key");
	const rawKey = xApiKey ?? authHeader?.replace(/^Bearer\s+/i, "").trim();

	if (!rawKey) {
		throw data({ error: "Missing API key" }, { status: 401 });
	}

	const record = await verifyApiKey(env.DB, rawKey);
	if (!record) {
		throw data({ error: "Invalid API key" }, { status: 401 });
	}

	let scopes: string[];
	try {
		scopes = JSON.parse(record.scopes) as string[];
	} catch {
		scopes = [];
	}
	if (!scopes.includes(requiredScope)) {
		throw data({ error: "Insufficient scope" }, { status: 403 });
	}

	return {
		organizationId: record.organizationId,
		apiKeyId: record.id,
		scopes,
	};
}

/**
 * Create a new API key for the given organization.
 * Returns the raw key once (caller must show to user); only hash is stored.
 */
export async function createApiKey(
	env: Cloudflare.Env,
	organizationId: string,
	userId: string,
	name: string,
	scopes: string[] = [INVENTORY_SCOPE],
): Promise<{ key: string; prefix: string; record: ApiKeyRecord }> {
	const secret = generateSecureRandomHex(KEY_SECRET_LENGTH);
	const key = `${KEY_PREFIX}${secret}`;
	const prefix = key.slice(0, KEY_PREFIX_LENGTH);
	const keyHash = await hashApiKey(key);

	const d1 = drizzle(env.DB);
	const id = crypto.randomUUID();
	const now = new Date();
	await d1.insert(apiKeyTable).values({
		id,
		organizationId,
		userId,
		keyHash,
		keyPrefix: prefix,
		name,
		scopes: JSON.stringify(scopes),
		createdAt: now,
	});

	const record: ApiKeyRecord = {
		id,
		organizationId,
		userId,
		keyHash,
		keyPrefix: prefix,
		name,
		scopes: JSON.stringify(scopes),
		lastUsedAt: null,
		createdAt: now,
	};

	return { key, prefix, record };
}
