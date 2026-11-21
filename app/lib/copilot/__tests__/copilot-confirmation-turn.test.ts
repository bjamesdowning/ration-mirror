/**
 * Billy's sequence end to end through the real AI SDK message conversion and
 * `activeTools` filtering (what Think passes to streamText): preview, then a
 * short confirmation. Guards BUG 1 ("apply_inventory_remove unavailable").
 */
import {
	convertToModelMessages,
	generateText,
	isStepCount,
	type ToolSet,
	tool,
	type UIMessage,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	type CopilotWriteCarryForwardDomain,
	resolveCopilotActiveTools,
} from "../active-tools.server";
import { lastUserText } from "../turn-text";

const NAMES = [
	"search_docs",
	"get_context",
	"list_inventory",
	"get_expired_items",
	"preview_inventory_remove",
	"apply_inventory_remove",
	"remove_cargo_item",
];
const tools: ToolSet = Object.fromEntries(
	NAMES.map((name) => [
		name,
		tool({
			description: name,
			inputSchema: z.object({}).passthrough(),
			execute: async () => ({ ok: true }),
		}),
	]),
);

function transcript(confirmation: string): UIMessage[] {
	return [
		{
			id: "u1",
			role: "user",
			parts: [{ type: "text", text: "Delete all my expired Cargo items" }],
		},
		{
			id: "a1",
			role: "assistant",
			parts: [
				{ type: "step-start" },
				{
					type: "tool-preview_inventory_remove",
					toolCallId: "c1",
					state: "output-available",
					input: { filter: "expired" },
					output: {
						ok: true,
						data: { previewToken: "tok_12345678", total: 18 },
					},
				},
				{ type: "step-start" },
				{ type: "text", text: "I found 18 expired Cargo items. Delete them?" },
			],
		},
		{ id: "u2", role: "user", parts: [{ type: "text", text: confirmation }] },
	] as UIMessage[];
}

async function toolsSentToModel(
	confirmation: string,
	carryForward: CopilotWriteCarryForwardDomain[] = [],
) {
	const messages = await convertToModelMessages(transcript(confirmation), {
		tools,
		ignoreIncompleteToolCalls: true,
	});
	const text = lastUserText({ messages });
	const active = resolveCopilotActiveTools(Object.keys(tools), text, {
		carryForward,
		wordForms: carryForward.length > 0,
	});
	let sent: string[] = [];
	const model = new MockLanguageModelV4({
		doGenerate: async (options) => {
			sent = (options.tools ?? []).map((t) => t.name);
			return {
				content: [{ type: "text", text: "ok" }],
				finishReason: { unified: "stop", raw: "stop" },
				usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
				warnings: [],
			} as never;
		},
	});
	await generateText({
		model,
		messages,
		tools,
		activeTools: active,
		stopWhen: isStepCount(1),
	});
	return { text, active, sent };
}

describe("confirmation turn after preview_inventory_remove", () => {
	it.each(["Please delete them", "  PLEASE DELETE THEM.\n"])(
		"%j keeps apply_inventory_remove active and sent",
		async (confirmation) => {
			const { text, active, sent } = await toolsSentToModel(confirmation);
			expect(text.trim()).toBe(confirmation.trim());
			expect(active).toContain("apply_inventory_remove");
			expect(sent).toContain("apply_inventory_remove");
		},
	);

	it.each(["Yes", "Go ahead", "Do it", "Confirm"])(
		"%j without carry-forward (flag off) does not send apply",
		async (confirmation) => {
			const { sent } = await toolsSentToModel(confirmation);
			expect(sent).not.toContain("apply_inventory_remove");
		},
	);

	it.each(["Yes", "Go ahead", "Do it", "Confirm"])(
		"%j with inventory carry-forward (flag on) sends apply",
		async (confirmation) => {
			const { sent } = await toolsSentToModel(confirmation, ["inventory"]);
			expect(sent).toContain("apply_inventory_remove");
			expect(sent).toContain("preview_inventory_remove");
		},
	);
});

describe("lastUserText", () => {
	it("reads the newest user message across string and part content", () => {
		expect(
			lastUserText({
				messages: [
					{ role: "user", content: "first" },
					{ role: "assistant", content: "reply" },
					{
						role: "user",
						content: [
							{ type: "text", text: "second " },
							{ type: "text", text: "part" },
						],
					},
				],
			}),
		).toBe("second \npart");
	});

	it("returns empty text when there is no user message", () => {
		expect(lastUserText({ messages: [] })).toBe("");
	});
});
