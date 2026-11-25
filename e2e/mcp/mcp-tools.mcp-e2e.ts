/**
 * MCP e2e: real JSON-RPC against the ration-mcp worker bundle running in
 * Miniflare with local D1/KV/R2 (see global-setup.ts). Run with
 * `bun run test:mcp-e2e`. Add tool coverage in tool-cases.ts.
 */

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
	envelopeOf,
	findBadTimestamps,
	findDeniedKeys,
	McpTestClient,
} from "./harness";
import { type CaseContext, type Envelope, TOOL_CASES } from "./tool-cases";

const url = inject("mcpUrl");
const apiKey = inject("mcpApiKey");
const seed = inject("mcpSeed");

/** Tools Phase 1 reshaped; tools/list must advertise every one of them. */
const AFFECTED_TOOLS = [
	"get_context",
	"get_cargo_item",
	"list_inventory",
	"apply_inventory_import",
	"update_meal",
	"get_nutrition_summary",
	"log_manifest_intake",
];

describe("MCP transport", () => {
	it("rejects a call without credentials", async () => {
		const anonymous = new McpTestClient(url, null);
		const reply = await anonymous.post({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
		});
		expect(reply.status).toBe(401);
		expect(reply.headers.get("www-authenticate")).toBeTruthy();
	});

	it("rejects an unknown API key", async () => {
		const stranger = new McpTestClient(
			url,
			"rtn_live_00000000000000000000000000000000",
		);
		const reply = await stranger.post({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
		});
		expect(reply.status).toBe(401);
	});

	it("initializes and lists tools with input schemas", async () => {
		const client = new McpTestClient(url, apiKey);
		const info = await client.initialize();
		expect(info.serverInfo).toMatchObject({ name: "Ration MCP" });
		const tools = await client.listTools();
		const names = tools.map((tool) => tool.name);
		for (const name of AFFECTED_TOOLS) expect(names).toContain(name);
		const listInventory = tools.find((tool) => tool.name === "list_inventory");
		const properties = (
			listInventory?.inputSchema as { properties?: Record<string, unknown> }
		)?.properties;
		expect(Object.keys(properties ?? {})).toEqual(
			expect.arrayContaining(["nameContains", "tag", "includeNutrition"]),
		);
	});
});

describe("MCP tool results (agent profile)", () => {
	const client = new McpTestClient(url, apiKey);
	const dataByCase = new Map<string, unknown>();
	const bytesByCase = new Map<string, number>();
	const ctx: CaseContext = {
		ids: seed.ids,
		today: seed.today,
		data: (caseId) => {
			if (!dataByCase.has(caseId)) {
				throw new Error(`case ${caseId} has not run (or failed)`);
			}
			return dataByCase.get(caseId);
		},
		bytes: (caseId) => bytesByCase.get(caseId) ?? Number.NaN,
	};

	beforeAll(async () => {
		await client.initialize();
	});

	afterAll(() => {
		const lines = [...bytesByCase].map(
			([caseId, bytes]) => `  ${caseId.padEnd(32)} ${bytes} B`,
		);
		console.log(`[mcp-e2e] reply sizes\n${lines.join("\n")}`);
	});

	it("has a unique id per case", () => {
		const ids = TOOL_CASES.map((toolCase) => toolCase.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	for (const toolCase of TOOL_CASES) {
		it(toolCase.id, async () => {
			const { result, bytes } = await client.callTool(
				toolCase.tool,
				toolCase.args(ctx),
			);
			const envelope = envelopeOf(result) as Envelope;
			expect(
				envelope.ok,
				`${toolCase.tool} error: ${JSON.stringify(envelope.error)}`,
			).toBe(true);
			expect(result.isError).toBe(false);
			expect(envelope.tool).toBe(toolCase.tool);
			bytesByCase.set(toolCase.id, bytes);
			dataByCase.set(toolCase.id, envelope.data);

			expect(findDeniedKeys(envelope), "internal ids in reply").toEqual([]);
			expect(findBadTimestamps(envelope), "non-ISO timestamps").toEqual([]);
			expect(bytes, `reply size budget for ${toolCase.id}`).toBeLessThanOrEqual(
				toolCase.maxBytes,
			);
			toolCase.check?.(envelope.data, ctx, envelope);
		});
	}
});
