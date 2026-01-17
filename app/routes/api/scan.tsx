// @ts-nocheck

import { getAuth } from "@clerk/react-router/ssr.server";
import { data } from "react-router";
import { checkBalance, deductCredits } from "~/lib/ledger.server";
import type { Route } from "./+types/scan";

// Cost for a visual scan
const SCAN_COST = 5;

export async function action({ request, context }: Route.ActionArgs) {
	const { userId } = await getAuth(request);
	if (!userId) {
		throw data({ error: "Unauthorized" }, { status: 401 });
	}

	// 1. Economy Check
	const balance = await checkBalance(context.cloudflare.env, userId);
	if (balance < SCAN_COST) {
		throw data(
			{ error: "Insufficient credits", required: SCAN_COST, current: balance },
			{ status: 402 },
		);
	}

	// 2. Parse Input
	const formData = await request.formData();
	const imageFile = formData.get("image");

	if (!imageFile || !(imageFile instanceof File)) {
		throw data({ error: "No image file provided" }, { status: 400 });
	}

	if (imageFile.size > 5 * 1024 * 1024) {
		// Enforce a reasonable limit (e.g. 5MB)
		throw data({ error: "Image too large (Max 5MB)" }, { status: 400 });
	}

	// 3. Prepare Image for AI
	const arrayBuffer = await imageFile.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);
	// Workers AI expects an array of numbers for the image input
	const imageArray = Array.from(uint8Array);

	try {
		// 4. Run AI Inference
		// Model: @cf/meta/llama-3.2-11b-vision-instruct
		const response = await context.cloudflare.env.AI.run(
			"@cf/meta/llama-3.2-11b-vision-instruct",
			{
				image: imageArray,
				prompt:
					"Identify the food items in this image. Return a JSON object with a key 'items' containing an array of objects with 'name' (string), 'quantity' (number, estimated), and 'tags' (array of strings, e.g. ['Dry', 'Produce', 'can', 'bottle']). Do not include markdown formatting or explanations, just the raw JSON.",
			},
		);

		// 5. Parse AI Response
		// Llama vision returns { response: string }
		let rawText = "";
		if ("response" in response) {
			rawText = response.response as string;
		} else {
			// Fallback or explicit handling if type differs
			rawText = JSON.stringify(response);
		}

		// Attempt to clean markdown code blocks if present (common LLM behavior)
		const cleanedText = rawText
			.replace(/```json/g, "")
			.replace(/```/g, "")
			.trim();

		// biome-ignore lint/suspicious/noExplicitAny: JSON parse result
		let detectedItems: any;
		try {
			detectedItems = JSON.parse(cleanedText);
		} catch (_e) {
			console.error("Failed to parse AI JSON:", rawText);
			throw new Error("AI returned invalid JSON format");
		}

		if (!detectedItems.items || !Array.isArray(detectedItems.items)) {
			throw new Error("AI response missing 'items' array");
		}

		// 6. Deduct Credits (only on successful scan)
		await deductCredits(
			context.cloudflare.env,
			userId,
			SCAN_COST,
			"Standard visual scan",
		);

		return { success: true, ...detectedItems };
	} catch (error) {
		console.error("Scan failed:", error);
		throw data({ error: "Scan processing failed" }, { status: 500 });
	}
}
