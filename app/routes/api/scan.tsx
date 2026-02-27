import { data } from "react-router";
import { extractModelText } from "~/lib/ai.server";
import { requireActiveGroup } from "~/lib/auth.server";
import { fetchOrgCargoIndex } from "~/lib/cargo-index.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	SCAN_UNITS,
	ScanAIResponseSchema,
	ScanResultSchema,
} from "~/lib/schemas/scan";
import type { Route } from "./+types/scan";

// Gemini model via Cloudflare AI Gateway → Google AI Studio
// See: https://developers.cloudflare.com/ai-gateway/providers/google-ai-studio/
const SCAN_MODEL = "gemini-3-flash-preview";

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
- Use these USDA FoodKeeper reference shelf-life estimates from the date of purchase:
  * Fresh whole/skimmed/semi-skimmed milk, cream: +14 days
  * Fresh eggs (whole, in shell): +28 days
  * Sliced deli meat, cooked ham, luncheon meat: +5 days
  * Fresh bread, rolls, bakery items: +7 days
  * Fresh raw chicken, poultry: +2 days
  * Fresh raw beef, pork, lamb: +3 days
  * Fresh raw fish, seafood: +2 days
  * Butter (refrigerated, unopened): +90 days
  * Soft cheese (ricotta, cottage, cream cheese): +14 days
  * Hard cheese block (cheddar, parmesan): +180 days
  * Fresh yoghurt: +21 days
  * Fresh juice (refrigerated, unopened): +14 days
  * Dried pasta, rice, grains: +730 days
  * Canned goods (unopened): +1095 days
- Return null for: non-food items, ambiguous items, shelf-stable pantry goods not in the list above, or any item where a printed expiry date is already clearly visible on the label (the label date is more accurate)

Examples:
- "Tesco Finest Irish Whole Milk 1L" -> name: "whole milk", quantity: 1, unit: "l", expiresAt: "${addDays(todayIso, 14)}", confidence: 0.95
- "Lidl Deluxe Free Range Eggs 12pk" -> name: "free range eggs", quantity: 12, unit: "unit", expiresAt: "${addDays(todayIso, 28)}", confidence: 0.92
- "SuperValu Own Brand Cheddar 200g" -> name: "cheddar cheese", quantity: 200, unit: "g", expiresAt: "${addDays(todayIso, 180)}", confidence: 0.90
- "Morton Sea Salt 737g" -> name: "sea salt", quantity: 737, unit: "g", expiresAt: null, confidence: 0.97`;
}

function addDays(isoDate: string, days: number): string {
	const d = new Date(isoDate);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function arrayBufferToBase64(buffer: ArrayBuffer) {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";

	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}

	return btoa(binary);
}

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Auth & Group Context
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const userId = user.id;

	// 2. Rate Limiting (Distributed via KV)
	// We rate limit by USER, not group, to prevent abuse and control AI costs
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"scan",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many scan requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	// 3. Parse Input
	const formData = await request.formData();
	const imageFile = formData.get("image");

	if (!imageFile || !(imageFile instanceof File)) {
		throw data({ error: "No image file provided" }, { status: 400 });
	}

	if (imageFile.size > 5 * 1024 * 1024) {
		throw data({ error: "Image too large (Max 5MB)" }, { status: 400 });
	}

	const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
	type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
	const mimeType = imageFile.type as AllowedMimeType;
	if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
		throw data(
			{ error: "Unsupported image format. Use JPEG, PNG, or WebP." },
			{ status: 415 },
		);
	}

	// 4. Prepare Image for AI + credit gate
	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId,
				cost: AI_COSTS.SCAN,
				reason: "Visual Scan",
			},
			async () => {
				const arrayBuffer = await imageFile.arrayBuffer();
				const base64Image = arrayBufferToBase64(arrayBuffer);

				// 5. Run AI Inference (AI Gateway -> Google AI Studio)
				try {
					const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } =
						context.cloudflare.env;

					if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
						throw data(
							{
								error: "Scan configuration missing",
							},
							{ status: 500 },
						);
					}

					const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio`;
					const todayIso = new Date().toISOString().slice(0, 10);
					const scanPrompt = buildScanPrompt(todayIso);

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
											{ text: scanPrompt },
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
						throw data(
							{
								error:
									status === 422
										? "The image took too long to process. Try a closer shot."
										: "Scan processing failed",
							},
							{ status },
						);
					}

					const payload = (await response.json()) as unknown;
					const modelText = extractModelText(payload);
					if (!modelText) {
						throw data({ error: "Scan processing failed" }, { status: 500 });
					}

					// Strip markdown code fences if model wraps JSON in ```json ... ```
					const cleanedText = modelText
						.replace(/^```(?:json)?\s*\n?/i, "")
						.replace(/\n?```\s*$/i, "")
						.trim();
					const parsedJson = JSON.parse(cleanedText);
					const parsedResult = ScanAIResponseSchema.safeParse(parsedJson);
					if (!parsedResult.success) {
						throw data(
							{
								error: "Scan processing failed",
							},
							{ status: 500 },
						);
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
							const tags = (item.tags ?? [])
								.map((tag) => tag.trim())
								.filter(Boolean);
							const expiresAt =
								item.expiresAt && DATE_PATTERN.test(item.expiresAt)
									? item.expiresAt
									: undefined;
							const confidence =
								typeof item.confidence === "number"
									? item.confidence
									: undefined;

							return {
								name,
								quantity,
								unit,
								expiresAt,
								tags,
								domain: "food",
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
							filename: imageFile.name,
							processedAt: new Date().toISOString(),
						},
					};

					const validatedScan = ScanResultSchema.safeParse(scanResultCandidate);
					if (!validatedScan.success) {
						throw data({ error: "Scan processing failed" }, { status: 500 });
					}

					// Use the narrow cargo index (id, name, domain, quantity, unit only)
					// to avoid unbounded SELECT * per d1-query-safety rules.
					const existingInventory = await fetchOrgCargoIndex(
						context.cloudflare.env.DB,
						groupId,
					);
					return { success: true, ...validatedScan.data, existingInventory };
				} catch (innerError) {
					// data() returns DataWithResponseInit, not Response — re-throw it for React Router
					if (
						innerError instanceof Response ||
						(innerError &&
							typeof innerError === "object" &&
							"type" in innerError &&
							(innerError as { type: string }).type === "DataWithResponseInit")
					) {
						throw innerError;
					}
					const errorMessage =
						innerError instanceof Error
							? innerError.message
							: String(innerError);

					// Check for Cloudflare/Worker specific timeout errors
					// Error 3046 is "Request timeout" from the Workers AI binding
					if (
						errorMessage.includes("3046") ||
						errorMessage.toLowerCase().includes("timeout")
					) {
						throw data(
							{
								error:
									"The receipt is too long to process in one go. Please try scanning it in two halves.",
							},
							{ status: 422 }, // Unprocessable Entity
						);
					}

					throw data(
						{
							error: "Scan processing failed",
						},
						{ status: 500 },
					);
				}
			},
		);
	} catch (outerError) {
		if (outerError instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					required: outerError.required,
					current: outerError.current,
				},
				{ status: 402 },
			);
		}
		// Re-throw DataWithResponseInit so React Router handles it correctly
		if (
			outerError instanceof Response ||
			(outerError &&
				typeof outerError === "object" &&
				"type" in outerError &&
				(outerError as { type: string }).type === "DataWithResponseInit")
		) {
			throw outerError;
		}
		throw data(
			{
				error: "Image processing failed",
			},
			{ status: 500 },
		);
	}
}
