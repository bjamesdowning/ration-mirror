import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { deleteMeal, getMeal, updateMeal } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileUpdateMealSchema } from "~/lib/schemas/mobile/meals";
import type { Route } from "./+types/v1.meals.$id";

export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const id = params.id;
		if (!id) throw data({ error: "Not Found" }, { status: 404 });

		const meal = await getMeal(context.cloudflare.env.DB, organizationId, id);
		if (!meal) throw data({ error: "Not Found" }, { status: 404 });
		return { meal };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const id = params.id;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

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

		if (request.method === "PATCH") {
			const body = await request.json();
			const input = MobileUpdateMealSchema.parse(body);
			const meal = await updateMeal(
				context.cloudflare.env.DB,
				organizationId,
				id,
				input,
			);
			return { meal };
		}

		if (request.method === "DELETE") {
			await deleteMeal(context.cloudflare.env.DB, organizationId, id);
			return { success: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
