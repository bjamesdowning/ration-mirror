/**
 * Better Auth secondaryStorage backed by RATION_KV.
 *
 * Sessions remain authoritative in D1 (`storeSessionInDatabase: true`).
 * KV is a read-through cache keyed by Better Auth's native keys, with a
 * namespace prefix to avoid collisions with other RATION_KV entries.
 */

export const BA_SECONDARY_STORAGE_PREFIX = "ba:ss:";

export function betterAuthSecondaryStorageKey(key: string): string {
	return `${BA_SECONDARY_STORAGE_PREFIX}${key}`;
}

type CounterMetadata = { expiresAtMs: number };

/** Cloudflare KV rejects expirationTtl below 60 seconds. */
function kvTtlSeconds(ttl: number): number {
	return Math.max(60, Math.floor(ttl));
}

export function createBetterAuthSecondaryStorage(kv: KVNamespace): {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
	getAndDelete: (key: string) => Promise<string | null>;
	increment: (key: string, ttl: number) => Promise<number>;
} {
	return {
		async get(key: string) {
			return kv.get(betterAuthSecondaryStorageKey(key));
		},
		async set(key: string, value: string, ttl?: number) {
			const options =
				typeof ttl === "number" && ttl > 0
					? { expirationTtl: kvTtlSeconds(ttl) }
					: undefined;
			await kv.put(betterAuthSecondaryStorageKey(key), value, options);
		},
		async delete(key: string) {
			await kv.delete(betterAuthSecondaryStorageKey(key));
		},
		async getAndDelete(key: string) {
			const storageKey = betterAuthSecondaryStorageKey(key);
			const value = await kv.get(storageKey);
			if (value != null) {
				await kv.delete(storageKey);
			}
			return value;
		},
		async increment(key: string, ttl: number) {
			const storageKey = betterAuthSecondaryStorageKey(key);
			const now = Date.now();
			const current = await kv.getWithMetadata<CounterMetadata>(storageKey);
			const expiresAtMs = current.metadata?.expiresAtMs;
			const open =
				current.value != null &&
				typeof expiresAtMs === "number" &&
				expiresAtMs > now;
			const count = open ? (Number(current.value) || 0) + 1 : 1;
			const nextExpiresAtMs = open
				? expiresAtMs
				: now + kvTtlSeconds(ttl) * 1000;
			await kv.put(storageKey, String(count), {
				expirationTtl: Math.max(60, Math.ceil((nextExpiresAtMs - now) / 1000)),
				metadata: { expiresAtMs: nextExpiresAtMs },
			});
			return count;
		},
	};
}

/** Drop a single session token from KV after direct D1 session mutations. */
export async function invalidateBetterAuthSessionCache(
	kv: KVNamespace,
	token: string,
): Promise<void> {
	if (!token) return;
	await kv.delete(betterAuthSecondaryStorageKey(token));
}

/**
 * Clear KV session cache for a user during purge/revoke (D1 delete bypasses Better Auth).
 */
export async function clearBetterAuthSecondarySessionsForUser(
	kv: KVNamespace,
	userId: string,
	sessionTokens: string[],
): Promise<void> {
	const deletes = sessionTokens
		.filter((token) => token.length > 0)
		.map((token) => kv.delete(betterAuthSecondaryStorageKey(token)));
	deletes.push(
		kv.delete(betterAuthSecondaryStorageKey(`active-sessions-${userId}`)),
	);
	await Promise.all(deletes);
}
