import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import { cookMeal } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.meals.$id.cook";

const CookRequestSchema = z.object({
	servings: z.coerce.number().int().min(1).optional(),
});

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

		let servings: number | undefined;
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const json = await request.json();
			const parsed = CookRequestSchema.safeParse(json);
			if (parsed.success) servings = parsed.data.servings;
		}

		const result = await cookMeal(context.cloudflare.env, organizationId, id, {
			servings,
		});
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
