import { describe, expect, it } from "vitest";
import {
	agentAnonRegisterSchema,
	agentClaimCompleteSchema,
	agentClaimStartSchema,
} from "../agent-auth";

describe("agentAnonRegisterSchema", () => {
	it("accepts anonymous registration", () => {
		const parsed = agentAnonRegisterSchema.parse({ type: "anonymous" });
		expect(parsed.type).toBe("anonymous");
	});

	it("accepts optional client_hint", () => {
		const parsed = agentAnonRegisterSchema.parse({
			type: "anonymous",
			client_hint: "cursor",
		});
		expect(parsed.client_hint).toBe("cursor");
	});

	it("rejects non-anonymous type", () => {
		const result = agentAnonRegisterSchema.safeParse({ type: "oauth" });
		expect(result.success).toBe(false);
	});
});

describe("agentClaimStartSchema", () => {
	it("accepts claim_token and email", () => {
		const parsed = agentClaimStartSchema.parse({
			claim_token: "a".repeat(32),
			email: "user@example.com",
		});
		expect(parsed.email).toBe("user@example.com");
	});

	it("rejects invalid email", () => {
		const result = agentClaimStartSchema.safeParse({
			claim_token: "a".repeat(32),
			email: "not-an-email",
		});
		expect(result.success).toBe(false);
	});
});

describe("agentClaimCompleteSchema", () => {
	it("accepts valid OTP", () => {
		const parsed = agentClaimCompleteSchema.parse({
			claim_token: "a".repeat(32),
			email: "user@example.com",
			otp: "123456",
		});
		expect(parsed.otp).toBe("123456");
	});

	it("rejects non-numeric OTP", () => {
		const result = agentClaimCompleteSchema.safeParse({
			claim_token: "a".repeat(32),
			email: "user@example.com",
			otp: "abcdef",
		});
		expect(result.success).toBe(false);
	});
});
