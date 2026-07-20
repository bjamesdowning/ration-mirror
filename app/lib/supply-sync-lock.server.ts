/**
 * Org-scoped KV lock for Supply sync materialize.
 * Prevents concurrent clear→insert races that duplicate shopping lines.
 */

export const SUPPLY_SYNC_LOCK_TTL_SEC = 60;
export const SUPPLY_SYNC_LOCK_RETRY_AFTER_SEC = 5;
const LOCK_PREFIX = "supply_sync_lock";
const ACQUIRE_RETRY_MS = 200;

export class SupplySyncBusyError extends Error {
	override name = "SupplySyncBusyError" as const;
	readonly retryAfterSeconds = SUPPLY_SYNC_LOCK_RETRY_AFTER_SEC;

	constructor() {
		super("Supply sync already in progress");
	}
}

function lockKey(organizationId: string): string {
	return `${LOCK_PREFIX}:${organizationId}`;
}

/**
 * Runs `fn` while holding a short-lived KV lock for the organization.
 * Throws {@link SupplySyncBusyError} if another sync holds the lock.
 */
export async function withSupplySyncLock<T>(
	kv: KVNamespace,
	organizationId: string,
	fn: () => Promise<T>,
): Promise<T> {
	const key = lockKey(organizationId);

	const existing = await kv.get(key);
	if (existing) {
		await new Promise((resolve) => setTimeout(resolve, ACQUIRE_RETRY_MS));
		const stillHeld = await kv.get(key);
		if (stillHeld) {
			throw new SupplySyncBusyError();
		}
	}

	const token = crypto.randomUUID();
	await kv.put(key, token, { expirationTtl: SUPPLY_SYNC_LOCK_TTL_SEC });

	// Best-effort ownership check (KV is eventually consistent).
	const held = await kv.get(key);
	if (held !== token) {
		throw new SupplySyncBusyError();
	}

	try {
		return await fn();
	} finally {
		try {
			const current = await kv.get(key);
			if (current === token) {
				await kv.delete(key);
			}
		} catch {
			// TTL will expire the lock if delete fails.
		}
	}
}
