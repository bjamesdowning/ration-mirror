import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import {
	toggleMealSelection,
	upsertMealSelection,
} from "~/lib/meal-selection.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.meals.$id.toggle-active";

const ToggleActiveBodySchema = z
	.object({
		servings: z.coerce.number().int().min(1).optional(),
	})
	.optional();

export async function action({ request, context, params }: Route.ActionArgs) {
	const id = params.id;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		let servingsOverride: number | undefined;
		try {
			const contentType = request.headers.get("content-type") ?? "";
			if (contentType.includes("application/json")) {
				const json = await request.json();
				const parsed = ToggleActiveBodySchema.safeParse(json);
				if (parsed.success) {
					servingsOverride = parsed.data?.servings;
				}
			}
		} catch {
			// No body — plain toggle
		}

		let result: { isActive: boolean; servingsOverride?: number | null };
		if (servingsOverride !== undefined) {
			result = await upsertMealSelection(
				context.cloudflare.env.DB,
				organizationId,
				id,
				servingsOverride,
			);
		} else {
			result = await toggleMealSelection(
				context.cloudflare.env.DB,
				organizationId,
				id,
			);
		}

		return { success: true, mealId: id, ...result };
	} catch (e) {
		return handleApiError(e);
	}
}
