/**
 * Scan queue consumer logic.
 * Runs AI vision on an image from R2, parses results, and stores status in KV for polling.
 */
import { extractModelText } from "~/lib/ai.server";
import { fetchOrgCargoIndex } from "~/lib/cargo-index.server";
import { log } from "~/lib/logging.server";
import {
	SCAN_UNITS,
	ScanAIResponseSchema,
	ScanResultSchema,
} from "~/lib/schemas/scan";

const SCAN_MODEL = "gemini-3-flash-preview";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JOB_TTL_SECONDS = 3600; // 1 hour

function addDays(isoDate: string, days: number): string {
	const d = new Date(isoDate);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function buildScanPrompt(todayIso: string): string {
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

export async function runScanConsumerJob(
	env: Env,
	message: ScanQueueMessage,
): Promise<void> {
	const { requestId, organizationId, imageKey, mimeType, filename } = message;
	const kvKey = `scan-job:${requestId}`;

	const writeStatus = async (result: ScanJobResult) => {
		await env.RATION_KV.put(kvKey, JSON.stringify(result), {
			expirationTtl: JOB_TTL_SECONDS,
		});
	};

	try {
		const imageObj = await env.STORAGE.get(imageKey);
		if (!imageObj) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Image not found in storage",
			});
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

		const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } = env;
		if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Scan configuration missing",
			});
			return;
		}

		const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio`;
		const todayIso = new Date().toISOString().slice(0, 10);

		const response = await fetch(
			`${gatewayUrl}/v1beta/models/${SCAN_MODEL}:generateContent`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"cf-aig-authorization": `Bearer ${CF_AIG_TOKEN}`,
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{
									inlineData: {
										mimeType,
										data: base64Image,
									},
								},
								{ text: buildScanPrompt(todayIso) },
							],
						},
					],
				}),
			},
		);

		if (!response.ok) {
			await response.text();
			const status =
				response.status === 408 ||
				response.status === 504 ||
				response.status === 524
					? 422
					: 500;
			await writeStatus({
				status: "failed",
				organizationId,
				error:
					status === 422
						? "The image took too long to process."
						: "Scan processing failed",
			});
			return;
		}

		const payload = (await response.json()) as unknown;
		const modelText = extractModelText(payload);
		if (!modelText) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Scan processing failed",
			});
			return;
		}

		const cleanedText = modelText
			.replace(/^```(?:json)?\s*\n?/i, "")
			.replace(/\n?```\s*$/i, "")
			.trim();
		const parsedJson = JSON.parse(cleanedText);
		const parsedResult = ScanAIResponseSchema.safeParse(parsedJson);
		if (!parsedResult.success) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Scan processing failed",
			});
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
				source: "image",
				filename,
				processedAt: new Date().toISOString(),
			},
		};

		const validatedScan = ScanResultSchema.safeParse(scanResultCandidate);
		if (!validatedScan.success) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Scan processing failed",
			});
			return;
		}

		const existingInventory = await fetchOrgCargoIndex(env.DB, organizationId);

		await writeStatus({
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

		await env.STORAGE.delete(imageKey);
	} catch (err) {
		log.error("Scan consumer job failed", err);
		await writeStatus({
			status: "failed",
			organizationId,
			error: err instanceof Error ? err.message : "Scan processing failed",
		});
		// Do not rethrow — status is stored; user can retry manually
	}
}
