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
		try {
			const response = await context.cloudflare.env.AI.run(
				"@cf/llava-hf/llava-1.5-7b-hf",
				{
					image: imageArray,
					prompt:
						"You are analyzing a grocery receipt or food items. Extract all food items with their quantities.\n\n" +
						'Return ONLY valid JSON in this exact format: {"items":[{"name":"item name","quantity":1,"unit":"unit","expiresAt":"YYYY-MM-DD"}]}\n\n' +
						"Rules:\n" +
						"1. name: Item name in lowercase (e.g., 'milk', 'bread')\n" +
						"2. quantity: Numeric value (default 1 if unclear)\n" +
						"3. unit: Use 'unit' for countable items, 'kg' for weight shown in kg, 'l' for liquid in liters\n" +
						"4. expiresAt: ONLY include if expiration date is clearly visible (format: YYYY-MM-DD)\n" +
						"5. Ignore non-food items\n\n" +
						'Example: {"items":[{"name":"milk","quantity":2,"unit":"l"},{"name":"bread","quantity":1,"unit":"unit"}]}',
					max_tokens: 2048,
				},
			);

			// 7. Parse AI Response
			// biome-ignore lint/suspicious/noExplicitAny: AI response type varies by model
			const aiResponse = response as any;
			let rawText = "";
			if ("description" in aiResponse) {
				rawText = aiResponse.description as string;
			} else if ("response" in aiResponse) {
				rawText = aiResponse.response as string;
			} else {
				rawText = JSON.stringify(aiResponse);
			}

			// Attempt to extract JSON
			let cleanedText = rawText;
			const jsonStart = rawText.indexOf("{");
			const jsonEnd = rawText.lastIndexOf("}");
			if (jsonStart !== -1 && jsonEnd !== -1) {
				cleanedText = rawText.substring(jsonStart, jsonEnd + 1);
			}

			// biome-ignore lint/suspicious/noExplicitAny: JSON parse result
			let detectedItems: any;
			try {
				detectedItems = JSON.parse(cleanedText);
			} catch (_e) {
				console.error("Failed to parse AI JSON. Raw response:", rawText);
				throw new Error("AI response was not valid JSON");
			}

			if (!detectedItems.items || !Array.isArray(detectedItems.items)) {
				throw new Error("AI response missing 'items' array");
			}

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
