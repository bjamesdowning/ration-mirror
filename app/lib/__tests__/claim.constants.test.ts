import { describe, expect, it } from "vitest";
import {
	AGENT_CLAIM_REISSUE_PATH,
	AGENT_ORPHAN_INACTIVITY_MS,
	buildClaimRecoveryPaths,
	CLAIM_OTP_MAX_ATTEMPTS,
	CLAIM_OTP_TTL_SEC,
	CLAIM_TOKEN_SLIDE_MS,
	CONNECT_CLAIM_PATH,
} from "../agent/claim.constants";

describe("claim.constants", () => {
	it("couples slide window to orphan inactivity", () => {
		expect(CLAIM_TOKEN_SLIDE_MS).toBe(AGENT_ORPHAN_INACTIVITY_MS);
		expect(CLAIM_TOKEN_SLIDE_MS).toBe(180 * 24 * 60 * 60 * 1000);
	});

	it("exposes OTP ceremony limits", () => {
		expect(CLAIM_OTP_TTL_SEC).toBe(600);
		expect(CLAIM_OTP_MAX_ATTEMPTS).toBe(5);
	});

	it("buildClaimRecoveryPaths strips trailing slash from origin", () => {
		const paths = buildClaimRecoveryPaths("https://ration.mayutic.com/");
		expect(paths.claimPage).toBe(
			`https://ration.mayutic.com${CONNECT_CLAIM_PATH}`,
		);
		expect(paths.reissueClaimUri).toBe(
			`https://ration.mayutic.com${AGENT_CLAIM_REISSUE_PATH}`,
		);
	});
});
