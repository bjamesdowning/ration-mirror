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

export function createBetterAuthSecondaryStorage(kv: KVNamespace): {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
} {
	return {
		async get(key: string) {
			return kv.get(betterAuthSecondaryStorageKey(key));
		},
		async set(key: string, value: string, ttl?: number) {
			const options =
				typeof ttl === "number" && ttl > 0
					? { expirationTtl: Math.max(60, Math.floor(ttl)) }
					: undefined;
			await kv.put(betterAuthSecondaryStorageKey(key), value, options);
		},
		async delete(key: string) {
			await kv.delete(betterAuthSecondaryStorageKey(key));
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
