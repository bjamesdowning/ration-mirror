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

const FIT_REMAINING_MACROS_PROMPT = `You are helping the caller choose something to eat that fits remaining personal calories/macros.

Not medical advice. Do not prescribe targets.

1. If flags/consent are unknown, call get_context.
2. Call get_nutrition_summary with no dates (defaults to today UTC) or from=to=temporal.todayUtc.
3. Read vsGoal — remaining is the UTC calendar day, not a dinner-only slice. If lunch is unlogged, remaining still includes it; say so. Do not subtract consumed from target yourself.
4. Call match_meals (strict, then delta if empty). When a kcal target exists, pass maxEnergyKcal ≈ vsGoal.energyKcal.remaining. Compare protein/carbs/fat the same way when those targets are set.
5. Present meals that fit. Omit unknown-nutrition meals from "fits" claims; mention them separately. Include pantry gaps from delta matches.
6. Offer add_meal_plan_entry for tonight's dinner only after confirmation.
7. set_nutrition_goal only when the user states numbers.`;

const IMPORT_RECIPE_FROM_TEXT_PROMPT = `You are helping import a recipe into Galley from text the user already has (URL paste, caption, or page text).

Ration MCP does not scrape URLs. The client LLM extracts a structured recipe, then create_meal.

1. Extract name, servings, ingredients (name, quantity, unit), and directions from the provided text.
2. If the user only pasted a URL with no caption/page text, tell them Ration cannot fetch it. They can open Galley Import in the Ration app, or paste the caption/ingredients here.
3. Call create_meal with the complete structured meal. Do not invent a recipe from a URL alone.
4. Report the created meal id and name.`;

const QUICK_EAT_SNACK_PROMPT = `The user personally ate a snack or pantry item.

Use quick_eat_cargo (not adjust_cargo_item). Missing pantry lines are created inside the tool, then deducted (net 0, restock reminder).

1. Call quick_eat_cargo with name (or cargoId), quantity > 0, a new operationKey UUID, and optional unit/date/notes. logIntake defaults true.
2. If the tool returns requiresDisambiguation, ask which candidate and retry with cargoId.
3. stockWasShort is expected when they ate more than stock (including a brand-new 0-net line).
4. Summarize what was logged (snack on Manifest, optional private intake). Not medical advice.`;

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
					"Camera/image scan and recipe URL import (Instagram, TikTok, YouTube, websites) stay native — Galley Import / Scan. MCP clients extract caption or page text with the client LLM, then create_meal. Copilot hard-blocks URL paste.",
					"MCP and Copilot kitchen tools are credit-free. Billed Gemini jobs (scan, URL import, Galley Generate, Plan Week) stay on native web/iOS only.",
					"Prefer propose_manifest_plan → commit_manifest_plan for week scheduling. Invent a meal with create_meal after list_inventory.",
					"Quick Eat (personal snack) is on MCP/Copilot via quick_eat_cargo. Missing pantry lines are created then eaten.",
					"Vector embeddings are backfilled async and do not block tool returns; prefer list_inventory / get_cargo_item until search catches up.",
					"Use cursor pagination for list_inventory and list_meals; preview_inventory_import is summary-first (sample rows + rowsOmitted).",
					"Protocol JSON-RPC -32602 means invalid tool arguments; domain/auth/confirm failures use the { ok:false, error } envelope.",
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
						`OAuth access tokens last **1 hour**; clients must refresh via \`offline_access\` (or reconnect after revoke/consent loss).\n` +
						`For receipts, follow the \`parse_receipt\` prompt.\n` +
						`Protocol JSON-RPC \`-32602\` means invalid tool arguments; domain/auth/confirm failures use the \`{ ok:false, error }\` envelope.\n`,
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
								"Fallback: get_expiring_items → match_meals → commit_manifest_plan → sync_supply_from_selected_meals.",
						},
					},
				],
			}),
		);

		sv.prompt(
			"fit_remaining_macros",
			"Suggest cookable meals that fit remaining UTC-day calories and macros. Not medical advice.",
			() => ({
				messages: [
					{
						role: "user",
						content: { type: "text", text: FIT_REMAINING_MACROS_PROMPT },
					},
				],
			}),
		);

		sv.prompt(
			"import_recipe_from_text",
			"Extract a structured recipe from caption or page text, then create_meal. Ration MCP does not scrape URLs.",
			() => ({
				messages: [
					{
						role: "user",
						content: { type: "text", text: IMPORT_RECIPE_FROM_TEXT_PROMPT },
					},
				],
			}),
		);

		sv.prompt(
			"quick_eat_snack",
			"Log a personal snack via quick_eat_cargo; missing pantry lines are created then eaten.",
			() => ({
				messages: [
					{
						role: "user",
						content: { type: "text", text: QUICK_EAT_SNACK_PROMPT },
					},
				],
			}),
		);
	}
}
