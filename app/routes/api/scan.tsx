import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getInventory } from "~/lib/inventory.server";
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

const SCAN_MODEL = "gemini-3-flash-preview";

const SCAN_PROMPT = `You are an expert pantry inventory assistant.
Analyze this image and extract all food items visible.
You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no explanation, no extra text:

{"items":[{"name":"string","quantity":number,"unit":"string","tags":["string"],"expiresAt":"string or null"}]}

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
- expiresAt must be YYYY-MM-DD or null
- Respond with ONLY the JSON object, nothing else.

Examples:
- "Tesco Finest Irish Whole Milk 1L" -> name: "whole milk", quantity: 1, unit: "l"
- "Lidl Deluxe Free Range Eggs 12pk" -> name: "free range eggs", quantity: 12, unit: "unit"
- "SuperValu Own Brand Cheddar 200g" -> name: "cheddar cheese", quantity: 200, unit: "g"`;

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

function extractModelText(payload: unknown) {
	if (!payload || typeof payload !== "object") return null;
	const candidates = (payload as { candidates?: Array<unknown> }).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;
	const first = candidates[0] as {
		content?: { parts?: Array<{ text?: string }> };
	};
	const parts = first?.content?.parts;
	if (!Array.isArray(parts)) return null;
	for (const part of parts) {
		if (typeof part.text === "string") {
			return part.text;
		}
	}
	return null;
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
		// Enforce a reasonable limit (e.g. 5MB)
		throw data({ error: "Image too large (Max 5MB)" }, { status: 400 });
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
													mimeType: "image/jpeg",
													data: base64Image,
												},
											},
											{ text: SCAN_PROMPT },
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

							return {
								name,
								quantity,
								unit,
								expiresAt,
								tags,
								domain: "food",
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

					const existingInventory = await getInventory(
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
