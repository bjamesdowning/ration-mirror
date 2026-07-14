import { describe, expect, it } from "vitest";
import {
	CopilotMessageSchema,
	CopilotStatusResponseSchema,
	CopilotStreamEventSchema,
} from "../copilot";

describe("copilot schemas", () => {
	it("validates assistant messages", () => {
		expect(
			CopilotMessageSchema.parse({
				id: "msg_1",
				role: "assistant",
				content: "Hello",
				createdAt: "2026-07-07T00:00:00.000Z",
			}),
		).toEqual({
			id: "msg_1",
			role: "assistant",
			content: "Hello",
			createdAt: "2026-07-07T00:00:00.000Z",
		});
	});

	it("validates blocked feature stream events", () => {
		const parsed = CopilotStreamEventSchema.parse({
			type: "blocked_feature",
			blocked: {
				feature: "scan",
				message: "Use the native scan flow.",
				deepLink: "ration://scan",
			},
		});
		expect(parsed.type).toBe("blocked_feature");
	});

	it("validates nested error stream events", () => {
		const parsed = CopilotStreamEventSchema.parse({
			type: "error",
			error: {
				code: "insufficient_credits",
				message: "Add credits to continue.",
			},
		});
		expect(parsed.type).toBe("error");
	});

	it("validates status payloads", () => {
		const parsed = CopilotStatusResponseSchema.parse({
			tier: "crew_member",
			freeConversationsRemaining: 2,
			allowanceResetAt: "2026-07-08T00:00:00.000Z",
			creditBalance: 12,
			autoDeductConsent: false,
			conversationFloorCost: 1,
			sessionIdleMs: 1_200_000,
			tokensPerCredit: 20_000,
			sessionMaxTokens: 128_000,
		});
		expect(parsed.freeConversationsRemaining).toBe(2);
	});

	it("validates session usage stream events", () => {
		const parsed = CopilotStreamEventSchema.parse({
			type: "session_usage_update",
			usage: {
				totalTokens: 12_000,
				maxTokens: 128_000,
				messageCount: 8,
				maxMessages: 40,
				creditsCharged: 1,
				creditBalance: 10,
				nextCreditAt: 8_001,
				nextCreditThreshold: 20_001,
			},
		});
		expect(parsed.type).toBe("session_usage_update");
	});

	it("validates session limit warning stream events", () => {
		const parsed = CopilotStreamEventSchema.parse({
			type: "session_limit_warning",
			warning: {
				severity: "soft",
				message: "This chat is getting long.",
			},
		});
		expect(parsed.type).toBe("session_limit_warning");
	});
});
