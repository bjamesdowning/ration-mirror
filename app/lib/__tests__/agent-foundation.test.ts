import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

import {
	generateClaimToken,
	generateOtp,
	hashToken,
} from "../agent/claim-crypto.server";
import { buildPersonalOrgRecords } from "../agent/org-records.server";
import { constantTimeEqual } from "../api-key.server";

describe("buildPersonalOrgRecords", () => {
	it("creates personal org with expected slug and owner role", () => {
		const userId = "user-123";
		const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
			userId,
			"Alice",
		);

		expect(orgId).toBeTruthy();
		expect(orgValues.id).toBe(orgId);
		expect(orgValues.name).toBe("Alice's Personal Group");
		expect(orgValues.slug).toBe(`personal-${userId}`);
		expect(orgValues.metadata).toEqual({ isPersonal: true });
		expect(orgValues.credits).toBe(0);
		expect(memberValues.organizationId).toBe(orgId);
		expect(memberValues.userId).toBe(userId);
		expect(memberValues.role).toBe("owner");
	});

	it("defaults name when userName is empty", () => {
		const { orgValues } = buildPersonalOrgRecords("uid", "");
		expect(orgValues.name).toBe("My's Personal Group");
	});
});

describe("claim-crypto", () => {
	it("generates 32-char hex claim tokens", () => {
		const token = generateClaimToken();
		expect(token).toMatch(/^[0-9a-f]{32}$/);
	});

	it("generates 6-digit OTPs", () => {
		const otp = generateOtp();
		expect(otp).toMatch(/^\d{6}$/);
		expect(Number(otp)).toBeGreaterThanOrEqual(100_000);
		expect(Number(otp)).toBeLessThan(1_000_000);
	});

	it("hashes tokens deterministically", async () => {
		const hash1 = await hashToken("test-token");
		const hash2 = await hashToken("test-token");
		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("constantTimeEqual", () => {
	it("returns true for equal strings", () => {
		expect(constantTimeEqual("abc", "abc")).toBe(true);
	});

	it("returns false for different strings", () => {
		expect(constantTimeEqual("abc", "abd")).toBe(false);
	});

	it("returns false for different lengths", () => {
		expect(constantTimeEqual("abc", "abcd")).toBe(false);
	});
});
