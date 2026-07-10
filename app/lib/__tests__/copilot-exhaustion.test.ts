import { describe, expect, it } from "vitest";
import {
	type CopilotExhaustionStatus,
	isCopilotExhausted,
} from "../copilot/exhaustion";

const base: CopilotExhaustionStatus = {
	tier: "free",
	freeConversationsRemaining: 0,
	creditBalance: 0,
	autoDeductConsent: false,
	conversationFloorCost: 1,
};

describe("isCopilotExhausted", () => {
	it("returns false when free conversations remain", () => {
		expect(isCopilotExhausted({ ...base, freeConversationsRemaining: 2 })).toBe(
			false,
		);
	});

	it("returns false when credits meet the conversation floor", () => {
		expect(isCopilotExhausted({ ...base, creditBalance: 5 })).toBe(false);
	});

	it("returns true when no free chats and insufficient credits", () => {
		expect(isCopilotExhausted(base)).toBe(true);
	});

	it("returns false for crew without consent so Ask can prompt auto-deduct", () => {
		expect(
			isCopilotExhausted({
				...base,
				tier: "crew_member",
				creditBalance: 0,
				autoDeductConsent: false,
			}),
		).toBe(false);
	});

	it("returns true for crew with consent but no credits", () => {
		expect(
			isCopilotExhausted({
				...base,
				tier: "crew_member",
				autoDeductConsent: true,
			}),
		).toBe(true);
	});

	it("returns false for null status", () => {
		expect(isCopilotExhausted(null)).toBe(false);
	});
});
