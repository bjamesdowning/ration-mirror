import { describe, expect, it } from "vitest";
import { err, ok, ToolEnvelopeSchema, toolReply } from "../envelope";

describe("toolReply structured content", () => {
	it("returns text, structuredContent, and isError for failures", () => {
		const body = err("demo_tool", "consent_required", "Consent required", {
			outcome: "no_effect",
			retryable: false,
			requestId: "req-1",
		});
		const reply = toolReply("demo_tool", body);
		expect(reply.isError).toBe(true);
		expect(reply.structuredContent).toMatchObject({
			ok: false,
			tool: "demo_tool",
			outcome: "no_effect",
			requestId: "req-1",
		});
		expect(JSON.parse(reply.content[0]?.text ?? "{}")).toEqual(body);
		expect(ToolEnvelopeSchema.safeParse(reply.structuredContent).success).toBe(
			true,
		);
	});

	it("returns isError false for success envelopes", () => {
		const body = ok(
			"demo_tool",
			{ value: 1 },
			{ outcome: "committed", operationId: "op-1" },
		);
		const reply = toolReply("demo_tool", body);
		expect(reply.isError).toBe(false);
		expect(reply.structuredContent.outcome).toBe("committed");
		expect(ToolEnvelopeSchema.safeParse(reply.structuredContent).success).toBe(
			true,
		);
	});
});
