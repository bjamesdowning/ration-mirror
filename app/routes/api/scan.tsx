import { requireAuth } from "~/lib/auth.server";
import { checkBalance, deductCredits } from "~/lib/ledger.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { data } from "~/lib/response";
import type { Route } from "./+types/scan";

// Cost for a visual scan
const SCAN_COST = 5;

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	// 1. Rate Limiting (Distributed via KV)
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

	// 2. Economy Check
	const balance = await checkBalance(context.cloudflare.env, userId);
	if (balance < SCAN_COST) {
		throw data(
			{ error: "Insufficient credits", required: SCAN_COST, current: balance },
			{ status: 402 },
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

	// 4. Prepare Image for AI - Convert to base64 data URL
	console.log(
		`[SCAN DEBUG] Processing image: ${imageFile.name}, size: ${imageFile.size}, type: ${imageFile.type}`,
	);

	const arrayBuffer = await imageFile.arrayBuffer();
	console.log(`[SCAN DEBUG] ArrayBuffer size: ${arrayBuffer.byteLength}`);

	const uint8Array = new Uint8Array(arrayBuffer);

	try {
		// Convert to base64 using safer method
		const base64 = btoa(
			Array.from(uint8Array)
				.map((byte) => String.fromCharCode(byte))
				.join(""),
		);
		console.log(`[SCAN DEBUG] Base64 encoded, length: ${base64.length}`);

		// Construct data URL with proper MIME type
		const mimeType = imageFile.type || "image/jpeg";
		const imageDataUrl = `data:${mimeType};base64,${base64}`;
		console.log(
			`[SCAN DEBUG] Data URL created, total length: ${imageDataUrl.length}`,
		);

		try {
			// 5. Run AI Inference
			// Model: @cf/meta/llama-3.2-11b-vision-instruct
			const response = await context.cloudflare.env.AI.run(
				"@cf/meta/llama-3.2-11b-vision-instruct",
				{
					image: imageDataUrl,
					prompt:
						"System: You are an orbital supply chain logistics officer. Analyze the provided image and identify all food items. \n" +
						"Requirement: Return ONLY a valid JSON object. No preamble. No markdown code blocks. No postscript.\n" +
						'Schema: { "items": [{ "name": "string", "quantity": number, "tags": ["Dry" | "Frozen" | "Fridge" | "Produce" | "Can" | "Bottle"] }] }\n' +
						"Guidelines:\n" +
						"- Name: Short, descriptive, uppercase (e.g., 'SYNTH-MEAT PASTE', 'OXYGENATED WATER').\n" +
						"- Quantity: Numeric estimate of units seen.\n" +
						"- Tags: Map to the most relevant categories.\n" +
						'- If no food items are found, return { "items": [] }.',
				},
			);

			console.log("[SCAN DEBUG] AI response received, parsing...");

			// 6. Parse AI Response
			// Llama vision returns { response: string }
			let rawText = "";
			if ("response" in response) {
				rawText = response.response as string;
			} else {
				// Fallback or explicit handling if type differs
				rawText = JSON.stringify(response);
			}
			console.log(`[SCAN DEBUG] Raw AI response: ${rawText.substring(0, 500)}`);

			// Attempt to extract JSON if the AI included conversational text
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

			// 7. Deduct Credits (only on successful scan)
			await deductCredits(
				context.cloudflare.env,
				userId,
				SCAN_COST,
				"Standard visual scan",
			);

			return { success: true, ...detectedItems };
		} catch (innerError) {
			console.error(
				"[SCAN DEBUG] Inner error during AI processing:",
				innerError,
			);
			console.error("[SCAN DEBUG] Error stack:", (innerError as Error).stack);
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
		console.error("[SCAN DEBUG] Error stack:", (outerError as Error).stack);
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
