/**
 * MCP resources and prompts.
 *
 * Resources expose static reference data (units, domains, schemas,
 * capabilities) at deterministic URIs. Agents can fetch them once and cache
 * them. Prompts provide curated, non-credit-using instruction templates.
 *
 * Everything here is credit-free and read-only.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AGENT_API_SCOPES, MCP_TOOL_GROUPS } from "../agent-readiness";
import { ITEM_DOMAINS } from "../domain";
import { getInventoryImportSchema } from "../inventory-import.server";
import { SUPPORTED_UNITS } from "../units";
import { APP_VERSION } from "../version";
import { MCP_SCOPES } from "./scopes";

interface ResourceBody {
	uri: string;
	mimeType: string;
	text: string;
}

function jsonResource(uri: string, value: unknown): ResourceBody {
	return {
		uri,
		mimeType: "application/json",
		text: JSON.stringify(value, null, 2),
	};
}

function markdownResource(uri: string, body: string): ResourceBody {
	return { uri, mimeType: "text/markdown", text: body };
}

const PARSE_RECEIPT_PROMPT = `You are helping a user log a grocery/household receipt into Ration.

Goal:
- Convert a free-text or image-derived receipt into a structured list of inventory items, then submit them to Ration via MCP without using any AI credits on Ration's side.

Rules:
1. Call \`inventory_import_schema\` first. Use the returned shape verbatim.
2. Build an array of items: \`{ name, quantity, unit, domain, tags?, expiresAt? }\`.
   - Prefer SI units (kg, g, l, ml). Pass any alias the user gave; Ration will normalize.
   - \`domain\` is one of "food" | "household" | "alcohol".
   - Skip non-pantry lines (taxes, totals, payment).
3. Call \`preview_inventory_import\` with the items. Inspect totals and per-row classification.
4. Surface to the user:
   - count of new items vs updates vs invalid rows
   - any warnings
5. If the user confirms, generate a unique \`idempotencyKey\` (e.g. \`receipt-\${ISO date}-\${hash}\`)
   and call \`apply_inventory_import\` with the previewToken from step 3 and that key.
6. Report back: imported, updated, errors. If the apply replays (\`meta.replayed: true\`), tell the user the original outcome was returned.

Do NOT:
- Call any AI scan tools (those use credits in the Ration UI; you're already an LLM).
- Submit duplicates without checking the previous outcome.
- Guess units when ambiguous — ask the user.`;

export function registerResourcesAndPrompts(server: McpServer): void {
	const sv = server as unknown as {
		resource: (
			name: string,
			uri: string,
			cb: () => Promise<{ contents: ResourceBody[] }>,
		) => void;
		prompt?: (
			name: string,
			description: string,
			cb: () => {
				messages: Array<{
					role: "user" | "assistant";
					content: { type: "text"; text: string };
				}>;
			},
		) => void;
	};

	// ── Reference resources ─────────────────────────────────────────────
	sv.resource("ration_units", "ration://units", async () => ({
		contents: [
			jsonResource("ration://units", {
				supported: SUPPORTED_UNITS,
				note: "Pass any alias to write tools — Ration normalizes via toSupportedUnit().",
			}),
		],
	}));

	sv.resource("ration_domains", "ration://domains", async () => ({
		contents: [
			jsonResource("ration://domains", {
				domains: ITEM_DOMAINS,
				note: 'Most pantry items are "food". Cleaning products → "household". Beer/wine/spirits → "alcohol".',
			}),
		],
	}));

	sv.resource(
		"inventory_import_schema",
		"ration://schemas/inventory-import",
		async () => ({
			contents: [
				jsonResource(
					"ration://schemas/inventory-import",
					getInventoryImportSchema(),
				),
			],
		}),
	);

	sv.resource("ration_capabilities", "ration://capabilities", async () => ({
		contents: [
			jsonResource("ration://capabilities", {
				version: APP_VERSION,
				scopes: {
					api: AGENT_API_SCOPES,
					mcp: MCP_SCOPES,
				},
				toolGroups: MCP_TOOL_GROUPS,
				notes: [
					"AI features that use credits stay in the Ration UI.",
					"All MCP tools are credit-free; vector embeddings are backfilled async.",
					"Use cursor pagination for list_inventory and list_meals.",
					"Bulk receipt imports go through preview_inventory_import → apply_inventory_import.",
				],
			}),
		],
	}));

	sv.resource(
		"ration_connection_guide",
		"ration://guides/connect",
		async () => ({
			contents: [
				markdownResource(
					"ration://guides/connect",
					`# Connect an MCP Client to Ration\n\n` +
						`1. Go to Settings → API Keys in the Ration app and create a key.\n` +
						`2. Choose scopes:\n` +
						`   - \`mcp:read\` for read-only agents.\n` +
						`   - \`mcp:inventory:write\` to add/update/remove pantry items.\n` +
						`   - \`mcp:galley:write\` to manage recipes.\n` +
						`   - \`mcp:manifest:write\` to schedule meals.\n` +
						`   - \`mcp:supply:write\` to edit shopping lists.\n` +
						`   - \`mcp:preferences:write\` to update allergens / settings.\n` +
						`   - Legacy \`mcp\` grants all of the above.\n` +
						`3. Configure your client to send the key as \`Authorization: Bearer <key>\` to \`https://mcp.ration.app/mcp\`.\n` +
						`4. Call \`get_context\` first to confirm which scopes the key has.\n` +
						`5. For receipts, follow the \`parse_receipt\` prompt.\n`,
				),
			],
		}),
	);

	// ── Prompts ─────────────────────────────────────────────────────────
	if (typeof sv.prompt === "function") {
		sv.prompt(
			"parse_receipt",
			"Stepwise guide for parsing a receipt and submitting items to Ration via the credit-free import tools.",
			() => ({
				messages: [
					{
						role: "user",
						content: { type: "text", text: PARSE_RECEIPT_PROMPT },
					},
				],
			}),
		);

		sv.prompt(
			"plan_week",
			"Suggest a meal plan for the next 7 days that minimizes waste from expiring items.",
			() => ({
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								"You are an agent helping plan meals for the next 7 days. Steps:\n" +
								"1. Call get_expiring_items(days: 10) to find items at risk.\n" +
								"2. Call match_meals(mode: 'delta', minMatch: 60) to find meals that use those items.\n" +
								"3. Propose a 7-day plan and confirm with the user.\n" +
								"4. On confirm, call bulk_add_meal_plan_entries with the chosen entries.\n" +
								"5. Optionally call sync_supply_from_selected_meals to build a shopping list.",
						},
					},
				],
			}),
		);
	}
}
