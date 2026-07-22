/**
 * Org-scoped readiness cache versioning.
 * Bumping the version changes match / manifest-ready KV keys so stale
 * "100% ready" payloads are never served after inventory mutations.
 */

const MATCH_VER_PREFIX = "match:ver:";
const MANIFEST_READY_VER_PREFIX = "manifest-ready:ver:";

export function matchCacheVersionKey(organizationId: string): string {
	return `${MATCH_VER_PREFIX}${organizationId}`;
}

export function manifestReadyCacheVersionKey(organizationId: string): string {
	return `${MANIFEST_READY_VER_PREFIX}${organizationId}`;
}

export async function getMatchCacheVersion(
	kv: KVNamespace | undefined,
	organizationId: string,
): Promise<string> {
	if (!kv) return "0";
	try {
		const v = await kv.get(matchCacheVersionKey(organizationId));
		return v && v.length > 0 ? v : "0";
	} catch {
		return "0";
	}
}

export async function getManifestReadyCacheVersion(
	kv: KVNamespace | undefined,
	organizationId: string,
): Promise<string> {
	if (!kv) return "0";
	try {
		const v = await kv.get(manifestReadyCacheVersionKey(organizationId));
		return v && v.length > 0 ? v : "0";
	} catch {
		return "0";
	}
}

/**
 * Bumps both meal-match and manifest-ready cache versions for an org.
 * Fire-and-forget safe: failures are non-fatal.
 */
export async function bumpReadinessCacheVersions(
	kv: KVNamespace | undefined,
	organizationId: string,
): Promise<void> {
	if (!kv) return;
	const next = String(Date.now());
	try {
		await Promise.all([
			kv.put(matchCacheVersionKey(organizationId), next),
			kv.put(manifestReadyCacheVersionKey(organizationId), next),
		]);
	} catch {
		// Cache version bump failed; TTL still bounds staleness
	}
}
