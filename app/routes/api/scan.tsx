import { requireActiveGroup } from "~/lib/auth.server";
import { checkBalance, deductCredits } from "~/lib/ledger.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { data } from "~/lib/response";
import type { Route } from "./+types/scan";

// Cost for a visual scan
const SCAN_COST = 5;

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Auth & Group Context
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const userId = user.id;

	// 2. Rate Limiting (Distributed via KV)
	// We rate limit by USER, not group, to prevent one user from draining group credits too fast
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

	// 3. Economy Check
	const balance = await checkBalance(context.cloudflare.env, groupId);
	if (balance < SCAN_COST) {
		throw data(
			{ error: "Insufficient credits", required: SCAN_COST, current: balance },
			{ status: 402 },
		);
	}

	// 4. Parse Input
	const formData = await request.formData();
	const imageFile = formData.get("image");

	if (!imageFile || !(imageFile instanceof File)) {
		throw data({ error: "No image file provided" }, { status: 400 });
	}

	if (imageFile.size > 5 * 1024 * 1024) {
		// Enforce a reasonable limit (e.g. 5MB)
		throw data({ error: "Image too large (Max 5MB)" }, { status: 400 });
	}

	// 5. Prepare Image for AI
	console.log(
		`[SCAN DEBUG] Processing image: ${imageFile.name}, size: ${imageFile.size}, type: ${imageFile.type}`,
	);

	try {
		const arrayBuffer = await imageFile.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		const imageArray = [...uint8Array];

		// 6. Run AI Inference
		// 6. Run AI Inference
		// We use Mistral Small 3.1 24B as it is EU-compliant and has excellent vision capabilities
		try {
			const prompt = `You are an expert pantry inventory assistant.
Analyze this image and extract all food items visible.
Return valid items as a simple list, one item per line.
Format each line EXACTLY as: name|quantity|unit|expiry

Rules:
- name: lowercase item name
- quantity: number (default 1)
- unit: "unit", "kg", "g", "l", "ml", "can", "pack"
- expiry: YYYY-MM-DD or "null" if not visible
- NO extra text, NO markdown, NO JSON.

Example:
apple|6|unit|null
milk|1|l|2024-12-31
canned beans|2|can|null`;

			const response = await context.cloudflare.env.AI.run(
				"@cf/llava-hf/llava-1.5-7b-hf",
				{
					prompt: prompt,
					image: imageArray,
				},
			);

			// 7. Parse AI Response
			// biome-ignore lint/suspicious/noExplicitAny: AI response type varies by model
			const aiResponse = response as any;
			let rawText = "";

			if (typeof aiResponse === "string") {
				rawText = aiResponse;
			} else if (aiResponse.description) {
				rawText = aiResponse.description;
			} else if (aiResponse.response) {
				rawText = aiResponse.response;
			} else {
				rawText = JSON.stringify(aiResponse);
			}

			console.log("[SCAN DEBUG] AI Raw Response:", rawText);

			// Robust parsing using Regex to find patterns anywhere in the text
			// This handles:
			// 1. Multiple items on one line
			// 2. Inconsistent newlines
			// 3. Extra text around the items
			// Pattern: name | quantity | unit | expiry
			const itemRegex =
				/([^|\r\n]+?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*([^|\r\n]+?)\s*\|\s*(null|\d{4}-\d{2}-\d{2})/g;

			const parsedItems = [];
			let match: RegExpExecArray | null;

			// biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
			while ((match = itemRegex.exec(rawText)) !== null) {
				const name = match[1].trim();
				const quantity = Number(match[2]);
				const unit = match[3].trim();
				const expiryRaw = match[4].trim();

				// Validation
				if (!name || Number.isNaN(quantity) || !unit) continue;

				const expiresAt =
					expiryRaw !== "null" && expiryRaw.match(/^\d{4}-\d{2}-\d{2}$/)
						? expiryRaw
						: undefined;

				parsedItems.push({
					name,
					quantity,
					unit,
					expiresAt,
					category: "other",
				});
			}

			if (parsedItems.length === 0) {
				console.warn("[SCAN DEBUG] No valid items parsed from text:", rawText);
				// Fallback: if absolutely nothing parsed, try to treat lines as just names
				const lines = rawText.split("\n");
				for (const line of lines) {
					if (line.trim().length > 3 && !line.includes("|")) {
						parsedItems.push({
							name: line.trim(),
							quantity: 1,
							unit: "unit",
							category: "other",
						});
					}
				}
			}

			const detectedItems = { items: parsedItems };

			// 8. Deduct Credits (only on successful scan)
			await deductCredits(
				context.cloudflare.env,
				groupId, // Organization ID
				userId, // User ID (Audit)
				SCAN_COST,
				"Standard visual scan",
			);

			return { success: true, ...detectedItems };
		} catch (innerError) {
			console.error(
				"[SCAN DEBUG] Inner error during AI processing:",
				innerError,
			);

			const errorMessage =
				innerError instanceof Error ? innerError.message : String(innerError);

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
					details:
						innerError instanceof Error
							? innerError.message
							: String(innerError),
				},
				{ status: 500 },
			);
		}
	} catch (outerError) {
		console.error(
			"[SCAN DEBUG] Outer error during image preparation:",
			outerError,
		);
		throw data(
			{
				error: "Image processing failed",
				details:
					outerError instanceof Error ? outerError.message : String(outerError),
			},
			{ status: 500 },
		);
	}
}
