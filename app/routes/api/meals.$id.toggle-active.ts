import { data } from "react-router";
import { z } from "zod";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	toggleMealSelection,
	upsertMealSelection,
	validateMealOwnership,
} from "~/lib/meal-selection.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.$id.toggle-active";

export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const mealId = params.id;

	if (!mealId) {
		throw data({ error: "Missing meal ID" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const isOwned = await validateMealOwnership(
		context.cloudflare.env.DB,
		groupId,
		mealId,
	);

	if (!isOwned) {
		throw data({ error: "Meal not found or unauthorized" }, { status: 404 });
	}

	// Optional: if a servings value is sent in the body, upsert with that override
	// rather than a plain toggle (so selection + servings is one round-trip).
	let servingsOverride: number | undefined;
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const json = await request.json();
			const parsed = z
				.object({ servings: z.coerce.number().int().min(1).optional() })
				.safeParse(json);
			if (parsed.success) servingsOverride = parsed.data.servings;
		}
	} catch {
		// No body — proceed as plain toggle
	}

	let result: { isActive: boolean; servingsOverride?: number | null };
	if (servingsOverride !== undefined) {
		result = await upsertMealSelection(
			context.cloudflare.env.DB,
			groupId,
			mealId,
			servingsOverride,
		);
	} else {
		result = await toggleMealSelection(
			context.cloudflare.env.DB,
			groupId,
			mealId,
		);
	}

	return { success: true, mealId, ...result };
}
