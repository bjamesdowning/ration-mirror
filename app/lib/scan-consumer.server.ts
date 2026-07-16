/**
 * Scan queue consumer logic.
 * Runs AI vision on an image from R2, parses results, stores status in D1 for polling.
 */
import { callGemini, gatewayFailureMessage } from "~/lib/ai-gateway.server";
import { fetchOrgCargoIndex } from "~/lib/cargo-index.server";
import { failAiJobWithRefund } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { parseModelJson } from "~/lib/parse-model-json";
import {
	runIdempotentAiJob,
	updateQueueJobResult,
} from "~/lib/queue-job.server";
import { SCAN_USER_ERROR, toUserFacingScanError } from "~/lib/scan-user-error";
import {
	SCAN_UNITS,
	ScanAIResponseSchema,
	ScanResultSchema,
} from "~/lib/schemas/scan";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function addDays(isoDate: string, days: number): string {
	const d = new Date(isoDate);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function buildScanPrompt(todayIso: string): string {
	return `You are an expert pantry inventory assistant.
Analyze this image and extract all food items visible.
You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no explanation, no extra text:

{"items":[{"name":"string","quantity":number,"unit":"string","tags":["string"],"expiresAt":"string or null","confidence":number}]}

Rules:
- Use lowercase item names
- IMPORTANT: Strip all brand names, store names, and marketing terms from item names
- Normalize to generic ingredient names (e.g., "whole milk" not "tesco brand a milk")
- Keep meaningful qualifiers that affect cooking: whole/skimmed, salted/unsalted, fresh/dried, minced/diced
- Extract size/weight into quantity+unit; do not embed sizes in the name
- If the same item appears multiple times, combine into one entry with summed quantity
- quantity defaults to 1 if unknown
- unit must be one of: ${SCAN_UNITS.join(", ")}
- tags are descriptive strings in an array (e.g. ["produce","fruit"])
- confidence is a number 0.0–1.0 reflecting how certain you are about the item identification
- Respond with ONLY the JSON object, nothing else.

Expiry date rules (today is ${todayIso}):
- expiresAt must be YYYY-MM-DD or null
- ONLY infer an expiry date when you have HIGH CONFIDENCE (0.85+) about the item type based on clear visual identification
- Use USDA FoodKeeper reference shelf-life estimates
- Return null for: non-food items, ambiguous items, shelf-stable pantry goods, or items with visible printed expiry

Examples:
- "Tesco Finest Irish Whole Milk 1L" -> name: "whole milk", quantity: 1, unit: "l", expiresAt: "${addDays(todayIso, 14)}", confidence: 0.95
- "Morton Sea Salt 737g" -> name: "sea salt", quantity: 737, unit: "g", expiresAt: null, confidence: 0.97`;
}

export function buildReceiptPdfPrompt(todayIso: string): string {
	return `You are an expert pantry inventory assistant processing a grocery receipt.
Extract every food and household item purchased from this receipt.
You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no explanation, no extra text:

{"items":[{"name":"string","quantity":number,"unit":"string","tags":["string"],"expiresAt":"string or null","confidence":number}]}

Rules:
- Use lowercase item names
- IMPORTANT: Strip all brand names, store names, and marketing terms from item names
- Normalize to generic ingredient names (e.g., "whole milk" not "tesco finest whole milk")
- Keep meaningful qualifiers that affect cooking or storage: whole/skimmed, salted/unsalted, fresh/dried, minced/diced, organic
- For weighted items (e.g. "Bananas 0.372 kg"), set quantity to the weight and unit accordingly
- For items sold by count (e.g. "6 Free Range Eggs"), set quantity to the count and unit to "piece" or the correct unit
- For items with a pack size in the name (e.g. "Cheddar 400g"), extract the weight as quantity+unit
- If the same item appears multiple times on the receipt, combine into one entry with summed quantity
- Ignore non-product lines: subtotals, discounts, Clubcard savings, VAT, totals, payment method lines
- quantity defaults to 1 if unknown
- unit must be one of: ${SCAN_UNITS.join(", ")}
- tags are descriptive strings in an array (e.g. ["dairy","cheese"])
- confidence is a number 0.0–1.0 reflecting how certain you are about the item identification
- Respond with ONLY the JSON object, nothing else.

Expiry date rules (today is ${todayIso}):
- expiresAt must be YYYY-MM-DD or null
- Infer an expiry date when you have HIGH CONFIDENCE (0.85+) about the item type and its typical shelf life
- Use USDA FoodKeeper reference shelf-life estimates from the purchase date (today)
- Return null for: shelf-stable pantry goods, frozen items (shelf life unclear without defrost date), or ambiguous items

Examples:
- "Tesco Whole Milk 2.272L" -> name: "whole milk", quantity: 2.272, unit: "l", expiresAt: "${addDays(todayIso, 14)}", confidence: 0.97
- "Free Range Eggs 12 Pack" -> name: "eggs", quantity: 12, unit: "piece", expiresAt: "${addDays(todayIso, 28)}", confidence: 0.95
- "Tesco Salted Butter 250g" -> name: "salted butter", quantity: 250, unit: "g", expiresAt: "${addDays(todayIso, 90)}", confidence: 0.95
- "Tesco Plain Flour 1.5kg" -> name: "plain flour", quantity: 1.5, unit: "kg", expiresAt: null, confidence: 0.97
- "Bananas 0.372 kg @ £1.11/kg" -> name: "bananas", quantity: 0.372, unit: "kg", expiresAt: "${addDays(todayIso, 5)}", confidence: 0.92`;
}

export interface ScanQueueMessage {
	requestId: string;
	organizationId: string;
	userId: string;
	imageKey: string;
	mimeType: string;
	filename?: string;
	cost: number;
}

export interface ScanJobResult {
	status: "completed" | "failed";
	organizationId: string;
	items?: Array<{
		id: string;
		name: string;
		quantity: number;
		unit: string;
		domain: string;
		tags: string[];
		expiresAt?: string;
		selected: boolean;
		confidence?: number;
	}>;
	existingInventory?: Array<{
		id: string;
		name: string;
		quantity: number;
		unit: string;
	}>;
	metadata?: { source: string; filename?: string; processedAt: string };
	error?: string;
}

const SCAN_CREDIT_REASON = "Visual Scan";

const SCAN_GATEWAY_MESSAGES = {
	timeout: SCAN_USER_ERROR.timeout,
	rateLimited: SCAN_USER_ERROR.rateLimited,
	blocked: SCAN_USER_ERROR.blocked,
	configMissing: SCAN_USER_ERROR.config,
	error: SCAN_USER_ERROR.generic,
} as const;

export async function runScanConsumerJob(
	env: Env,
	message: ScanQueueMessage,
): Promise<void> {
	const {
		requestId,
		organizationId,
		userId,
		imageKey,
		mimeType,
		filename,
		cost,
	} = message;

	await runIdempotentAiJob(env.DB, requestId, async () => {
		await executeScanConsumerJob(env, {
			requestId,
			organizationId,
			userId,
			imageKey,
			mimeType,
			filename,
			cost,
		});
	});
}

async function executeScanConsumerJob(
	env: Env,
	message: ScanQueueMessage,
): Promise<void> {
	const {
		requestId,
		organizationId,
		userId,
		imageKey,
		mimeType,
		filename,
		cost,
	} = message;

	const failJob = async (error: string) => {
		await failAiJobWithRefund(env, {
			requestId,
			organizationId,
			userId,
			cost,
			reason: SCAN_CREDIT_REASON,
			writeStatus: async () => {
				return updateQueueJobResult(env.DB, requestId, "failed", {
					status: "failed",
					organizationId,
					error,
				});
			},
		});
	};

	try {
		const imageObj = await env.STORAGE.get(imageKey);
		if (!imageObj) {
			await failJob(SCAN_USER_ERROR.missingUpload);
			return;
		}

		const arrayBuffer = await imageObj.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		const base64Image = btoa(binary);

		const todayIso = new Date().toISOString().slice(0, 10);
		const isPdf = mimeType === "application/pdf";
		const prompt = isPdf
			? buildReceiptPdfPrompt(todayIso)
			: buildScanPrompt(todayIso);

		const gatewayResult = await callGemini(env, {
			feature: "scan",
			parts: [
				{
					inlineData: {
						mimeType,
						data: base64Image,
					},
				},
				{ text: prompt },
			],
			metadata: { organizationId, userId },
		});

		if (!gatewayResult.ok) {
			await failJob(
				gatewayFailureMessage(gatewayResult.reason, SCAN_GATEWAY_MESSAGES),
			);
			return;
		}

		const modelText = gatewayResult.text;

		const parsedJson = parseModelJson(modelText);
		if (parsedJson === null) {
			log.error("Scan model returned unparseable JSON", {
				requestId,
				organizationId,
				isPdf,
				textLength: modelText.length,
			});
			await failJob(SCAN_USER_ERROR.parse);
			return;
		}

		const parsedResult = ScanAIResponseSchema.safeParse(parsedJson);
		if (!parsedResult.success) {
			log.error("Scan model JSON failed schema validation", {
				requestId,
				organizationId,
				issues: parsedResult.error.issues.slice(0, 5),
			});
			await failJob(SCAN_USER_ERROR.schema);
			return;
		}

		const parsedItems = parsedResult.data.items
			.map((item) => {
				const name = item.name.trim().toLowerCase();
				if (!name) return null;
				const quantity =
					typeof item.quantity === "number" && item.quantity > 0
						? item.quantity
						: 1;
				const unit = item.unit ?? "unit";
				const tags = (item.tags ?? []).map((t) => t.trim()).filter(Boolean);
				const expiresAt =
					item.expiresAt && DATE_PATTERN.test(item.expiresAt)
						? item.expiresAt
						: undefined;
				const confidence =
					typeof item.confidence === "number" ? item.confidence : undefined;
				return {
					name,
					quantity,
					unit,
					expiresAt,
					tags,
					domain: "food" as const,
					confidence,
				};
			})
			.filter((item): item is NonNullable<typeof item> => item !== null);

		const scanResultCandidate = {
			items: parsedItems.map((item) => ({
				id: crypto.randomUUID(),
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				domain: item.domain,
				tags: item.tags,
				expiresAt: item.expiresAt,
				selected: true,
				confidence: item.confidence,
			})),
			metadata: {
				source: isPdf ? ("pdf" as const) : ("image" as const),
				filename,
				processedAt: new Date().toISOString(),
			},
		};

		const validatedScan = ScanResultSchema.safeParse(scanResultCandidate);
		if (!validatedScan.success) {
			log.error("Scan result failed final schema validation", {
				requestId,
				organizationId,
				issues: validatedScan.error.issues.slice(0, 5),
			});
			await failJob(SCAN_USER_ERROR.schema);
			return;
		}

		const existingInventory = await fetchOrgCargoIndex(env.DB, organizationId);

		await updateQueueJobResult(env.DB, requestId, "completed", {
			status: "completed",
			organizationId,
			items: validatedScan.data.items,
			existingInventory: existingInventory.map((r) => ({
				id: r.id,
				name: r.name,
				quantity: r.quantity,
				unit: r.unit,
			})),
			metadata: validatedScan.data.metadata,
		});

		try {
			await env.STORAGE.delete(imageKey);
		} catch (cleanupError) {
			log.warn("Scan image cleanup failed", {
				requestId,
				organizationId,
				error:
					cleanupError instanceof Error
						? cleanupError.message
						: "Unknown cleanup error",
			});
		}
	} catch (err) {
		log.error("Scan consumer job failed", err);
		await failJob(toUserFacingScanError(err));
		// Do not rethrow — status is stored; user can retry manually
	}
}
