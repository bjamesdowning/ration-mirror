import { describe, expect, it } from "vitest";
import {
	buildCopilotContinuationDraft,
	COPILOT_CONTINUATION_DRAFT_PREFIX,
	formatCopilotTranscriptForCopy,
} from "../copilot/continuation";

describe("copilot continuation", () => {
	it("returns the continuation composer prefix", () => {
		expect(buildCopilotContinuationDraft()).toBe(
			COPILOT_CONTINUATION_DRAFT_PREFIX,
		);
	});

	it("formats transcript messages for clipboard copy", () => {
		expect(
			formatCopilotTranscriptForCopy([
				{ role: "user", content: "What is expiring?" },
				{ role: "assistant", content: "Butter expires Friday." },
			]),
		).toBe("You: What is expiring?\n\nRation: Butter expires Friday.");
	});

	it("skips empty transcript lines", () => {
		expect(
			formatCopilotTranscriptForCopy([
				{ role: "user", content: "  " },
				{ role: "assistant", content: "Ready when you are." },
			]),
		).toBe("Ration: Ready when you are.");
	});
});
