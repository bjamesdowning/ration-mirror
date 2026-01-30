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

		// 6. Run AI Inference
		// 6. Run AI Inference
		// We use Mistral Small 3.1 24B as it is EU-compliant and has excellent vision capabilities
		try {
			const prompt = `You are an expert pantry inventory assistant.
Analyze this image and extract all food items visible.
Return ONLY a valid JSON object with a single key "items" containing a list of objects.
Do not include any markdown formatting, backticks, or explanation. Only the raw JSON.

Structure:
{
  "items": [
    {
      "name": "item name (lowercase)",
      "quantity": number,
      "unit": "unit" | "kg" | "g" | "l" | "ml" | "can" | "pack",
      "expiresAt": "YYYY-MM-DD" (strictly only if visible on package)
    }
  ]
}

Rules:
- Ignore non-food items.
- If quantity is unclear, default to 1.
- Use "unit" for countable items like apples or bottles if weight isn't clear.
`;

			const response = await context.cloudflare.env.AI.run(
				"@cf/mistralai/mistral-small-3.1-24b-instruct",
				{
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: prompt },
								{
									type: "image",
									image: new Uint8Array(arrayBuffer), // Mistral expects Uint8Array or base64
								},
							],
						},
					],
					max_tokens: 32768, // High limit (32k) to allow for very long receipts, well within 128k context
				},
			);

			// 7. Parse AI Response
			// biome-ignore lint/suspicious/noExplicitAny: AI response type varies by model
			const aiResponse = response as any;

			// Mistral returns the response in .response or .description depending on the binding version/gateway
			let rawText = "";
			if (typeof aiResponse === "string") {
				rawText = aiResponse;
			} else if (aiResponse.response) {
				rawText = aiResponse.response;
			} else if (aiResponse.description) {
				rawText = aiResponse.description;
			} else {
				rawText = JSON.stringify(aiResponse);
			}

			console.log("[SCAN DEBUG] AI Raw Response:", rawText);

			// Robust JSON extraction
			// Find the first '{' and the last '}' to strip out any potential "Here is the JSON:" preamble
			let cleanedText = rawText;
			const jsonStart = rawText.indexOf("{");
			const jsonEnd = rawText.lastIndexOf("}");

			if (jsonStart !== -1 && jsonEnd !== -1) {
				cleanedText = rawText.substring(jsonStart, jsonEnd + 1);
			} else {
				throw new Error("No JSON object found in AI response");
			}

			// biome-ignore lint/suspicious/noExplicitAny: JSON parse result
			let detectedItems: any;
			try {
				detectedItems = JSON.parse(cleanedText);
			} catch (_e) {
				console.error("Failed to parse AI JSON. Cleaned Text:", cleanedText);
				throw new Error("AI response was not valid JSON");
			}

			if (!detectedItems.items || !Array.isArray(detectedItems.items)) {
				// Sometimes models wrap it differently, try to salvage
				if (Array.isArray(detectedItems)) {
					detectedItems = { items: detectedItems };
				} else {
					throw new Error("AI response missing 'items' array");
				}
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
