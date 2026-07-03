import {
	MOBILE_PENDING_HANDOFF_KV_PREFIX,
	MOBILE_PENDING_HANDOFF_TTL_SEC,
} from "~/lib/mobile/constants";

export async function storeMobilePendingHandoff(
	kv: KVNamespace,
	codeChallenge: string,
): Promise<string> {
	const pendingId = crypto.randomUUID();
	await kv.put(
		`${MOBILE_PENDING_HANDOFF_KV_PREFIX}${pendingId}`,
		JSON.stringify({ codeChallenge }),
		{ expirationTtl: MOBILE_PENDING_HANDOFF_TTL_SEC },
	);
	return pendingId;
}

export async function readMobilePendingHandoff(
	kv: KVNamespace,
	pendingId: string,
): Promise<string | null> {
	const raw = await kv.get(`${MOBILE_PENDING_HANDOFF_KV_PREFIX}${pendingId}`);
	if (!raw) return null;
	const parsed = JSON.parse(raw) as { codeChallenge?: string };
	return typeof parsed.codeChallenge === "string" ? parsed.codeChallenge : null;
}
