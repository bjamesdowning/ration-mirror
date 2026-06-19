import { describe, expect, it } from "vitest";
import {
	AGENT_STUB_EMAIL_DOMAIN,
	buildAgentStubEmail,
	isAgentStubEmail,
	isReengagementEmailRecipient,
} from "~/lib/agent/stub-user";

describe("stub-user", () => {
	describe("buildAgentStubEmail", () => {
		it("uses the agent stub domain", () => {
			expect(buildAgentStubEmail("user-123")).toBe(
				`agent+user-123${AGENT_STUB_EMAIL_DOMAIN}`,
			);
		});
	});

	describe("isAgentStubEmail", () => {
		it("returns true for agent stub addresses", () => {
			expect(isAgentStubEmail(`agent+abc${AGENT_STUB_EMAIL_DOMAIN}`)).toBe(
				true,
			);
		});

		it("returns false for real user emails", () => {
			expect(isAgentStubEmail("billy@example.com")).toBe(false);
			expect(isAgentStubEmail(`not-agent${AGENT_STUB_EMAIL_DOMAIN}`)).toBe(
				false,
			);
		});
	});

	describe("isReengagementEmailRecipient", () => {
		it("allows verified non-stub users", () => {
			expect(
				isReengagementEmailRecipient({
					email: "billy@example.com",
					emailVerified: true,
				}),
			).toBe(true);
		});

		it("rejects unverified users", () => {
			expect(
				isReengagementEmailRecipient({
					email: "billy@example.com",
					emailVerified: false,
				}),
			).toBe(false);
		});

		it("rejects agent stub kitchens even if marked verified", () => {
			expect(
				isReengagementEmailRecipient({
					email: buildAgentStubEmail("stub-id"),
					emailVerified: true,
				}),
			).toBe(false);
		});
	});
});
