import { describe, expect, it } from "vitest";
import { decodeAgentResponseFrame } from "~/lib/copilot/agent-frame.client";
import { copilotEventKeepsTurnAlive } from "~/lib/copilot/stream-resume.client";

describe("decodeAgentResponseFrame recovery frames", () => {
	it("maps done + outcome:recovering to turn_recovering (not turn_end)", () => {
		expect(
			decodeAgentResponseFrame({
				type: "cf_agent_use_chat_response",
				id: "req-1",
				body: "",
				done: true,
				outcome: "recovering",
			}),
		).toEqual({ kind: "turn_recovering" });
	});

	it("keeps a normal done frame as turn_end", () => {
		expect(
			decodeAgentResponseFrame({
				type: "cf_agent_use_chat_response",
				id: "req-1",
				body: "",
				done: true,
			}),
		).toEqual({ kind: "turn_end" });
	});

	it("maps cf_agent_chat_recovering status frames", () => {
		expect(
			decodeAgentResponseFrame({
				type: "cf_agent_chat_recovering",
				recovering: true,
			}),
		).toEqual({ kind: "recovering", recovering: true });
		expect(
			decodeAgentResponseFrame({
				type: "cf_agent_chat_recovering",
				recovering: false,
			}),
		).toEqual({ kind: "recovering", recovering: false });
	});

	it("treats the recovering status frame as turn activity", () => {
		expect(copilotEventKeepsTurnAlive("cf_agent_chat_recovering")).toBe(true);
	});
});
