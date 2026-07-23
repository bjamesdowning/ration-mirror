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
import { MCP_SERVER_VERSION } from "../version";
import { formatMcpConnectPlainText } from "./connect-copy";
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
1. Prefer the resource \`ration://schemas/inventory-import\` for the item shape.
2. Build an array of items: \`{ name, quantity, unit, domain, tags?, expiresAt? }\`.
   - Prefer SI units (kg, g, l, ml). Pass any alias the user gave; Ration will normalize.
   - \`domain\` is one of "food" | "household" | "alcohol".
   - Skip non-pantry lines (taxes, totals, payment).
3. Call \`preview_inventory_import\` with the items. Inspect totals, the sample rows, and rowsOmitted.
4. Surface to the user:
   - count of new items vs updates vs invalid rows
   - any warnings
5. If the user confirms, generate a unique \`idempotencyKey\` (e.g. \`receipt-\${ISO date}-\${hash}\`)
   and call \`apply_inventory_import\` with the previewToken from step 3 and that key (no second host approval — chat confirm is enough).
6. Report back: imported, updated, errors. If the apply replays (\`meta.replayed: true\`), tell the user the original outcome was returned.

Do NOT:
- Call camera/OCR scan for plain text lists (use preview/apply instead).
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
				note: "Pass any alias to write tools — Ration normalizes via normalizeUnitAlias().",
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
				version: MCP_SERVER_VERSION,
				scopes: {
					api: AGENT_API_SCOPES,
					mcp: MCP_SCOPES,
				},
				toolGroups: MCP_TOOL_GROUPS,
				notes: [
					"Camera/image scan and recipe URL extraction still prefer native deep links; text receipt lists use preview_inventory_import → apply_inventory_import (credit-free).",
					"Credit-aware tools start_plan_week and start_generate_meal spend the same credits as the native UI after approval.",
					"Prefer propose_manifest_plan → commit_manifest_plan for credit-free week scheduling.",
					"Most MCP tools are credit-free; vector embeddings are backfilled async and do not block tool returns.",
					"Use cursor pagination for list_inventory and list_meals; preview_inventory_import is summary-first (sample rows + rowsOmitted).",
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
					`# Connect an MCP Client to Ration\n\n${formatMcpConnectPlainText()}\n\n` +
						`After connecting, call \`get_context\` first to confirm active scopes.\n` +
						`For receipts, follow the \`parse_receipt\` prompt.\n`,
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
								"You are an agent helping plan meals for the next 7 days. Prefer the purpose-built path:\n" +
								"1. Call propose_manifest_plan (uses expiring items + match_meals internally).\n" +
								"2. Present the compact proposal and confirm with the user.\n" +
								"3. On confirm, call commit_manifest_plan with the entries (optionally syncSupply: true).\n" +
								"4. For billed AI Plan Week instead, disclose ration://manifest/plan-week and call start_plan_week after approval.\n" +
								"Fallback: get_expiring_items → match_meals → commit_manifest_plan → sync_supply_from_selected_meals.",
						},
					},
				],
			}),
		);
	}
}
