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
			brackets: [{ maxTokens: 12_000, credits: 1 }],
		});
		expect(parsed.freeConversationsRemaining).toBe(2);
	});
});
