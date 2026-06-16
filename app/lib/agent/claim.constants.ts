/** Agent claim ceremony paths and time limits — no server/crypto imports. */

/** 6 calendar months — orphan purge and claim-token slide window. */
export const AGENT_ORPHAN_INACTIVITY_MS = 180 * 24 * 60 * 60 * 1000;

/** Per-activity claim token slide — coupled to orphan window. */
export const CLAIM_TOKEN_SLIDE_MS = AGENT_ORPHAN_INACTIVITY_MS;

export const CLAIM_OTP_TTL_SEC = 600; // 10 minutes
export const CLAIM_OTP_MAX_ATTEMPTS = 5;

export const CONNECT_CLAIM_PATH = "/connect/claim";
export const AGENT_CLAIM_REISSUE_PATH = "/api/agent/auth/claim/reissue";

export function buildClaimRecoveryPaths(origin: string) {
	const base = origin.replace(/\/$/, "");
	return {
		claimPage: `${base}${CONNECT_CLAIM_PATH}`,
		reissueClaimUri: `${base}${AGENT_CLAIM_REISSUE_PATH}`,
	};
}
