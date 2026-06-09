import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DELEGATION_TOKEN_AUDIENCE,
	DELEGATION_TOKEN_TTL_SEC,
	signDelegationToken,
	verifyDelegationTokenClaims,
} from "../fin-delegation.server";

const SECRET = "test-delegation-secret-32chars-min!!";
const ISSUER = "https://ration.mayutic.com";

describe("fin-delegation.server", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("signs and verifies a delegation token round-trip", async () => {
		const token = await signDelegationToken({
			userId: "user-abc",
			organizationId: "org-xyz",
			secret: SECRET,
			issuer: ISSUER,
		});
		expect(token).toBeTruthy();
		if (!token) throw new Error("expected token");

		const claims = await verifyDelegationTokenClaims({
			rawToken: token,
			secret: SECRET,
			issuer: ISSUER,
		});
		expect(claims).toEqual({
			userId: "user-abc",
			organizationId: "org-xyz",
		});
	});

	it("rejects expired tokens", async () => {
		const token = await signDelegationToken({
			userId: "user-abc",
			organizationId: "org-xyz",
			secret: SECRET,
			issuer: ISSUER,
			nowSeconds: Math.floor(Date.now() / 1000),
		});
		vi.advanceTimersByTime((DELEGATION_TOKEN_TTL_SEC + 1) * 1000);

		if (!token) throw new Error("expected token");
		await expect(
			verifyDelegationTokenClaims({
				rawToken: token,
				secret: SECRET,
				issuer: ISSUER,
			}),
		).rejects.toThrow("Invalid delegation token");
	});

	it("rejects wrong audience", async () => {
		const token = await signDelegationToken({
			userId: "user-abc",
			organizationId: "org-xyz",
			secret: SECRET,
			issuer: ISSUER,
		});
		if (!token) throw new Error("expected token");

		expect(DELEGATION_TOKEN_AUDIENCE).toBe("ration-mcp-delegation");

		await expect(
			verifyDelegationTokenClaims({
				rawToken: token,
				secret: "wrong-secret",
				issuer: ISSUER,
			}),
		).rejects.toThrow("Invalid delegation token");
	});

	it("returns null when required fields are missing", async () => {
		const token = await signDelegationToken({
			userId: "",
			organizationId: "org-xyz",
			secret: SECRET,
			issuer: ISSUER,
		});
		expect(token).toBeNull();
	});
});
