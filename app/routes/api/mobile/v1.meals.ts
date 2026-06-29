import { handleApiError } from "~/lib/error-handler";
import { getMeals } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileMealsListQuerySchema } from "~/lib/schemas/mobile/supply";
import type { Route } from "./+types/v1.meals";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_list",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw new Response(
				JSON.stringify({ error: "Too many requests. Please try again later." }),
				{ status: 429, headers: { "Content-Type": "application/json" } },
			);
		}

		const url = new URL(request.url);
		const query = MobileMealsListQuerySchema.parse({
			limit: url.searchParams.get("limit") ?? undefined,
			tag: url.searchParams.get("tag") ?? undefined,
		});

		const meals = await getMeals(
			context.cloudflare.env.DB,
			organizationId,
			query.tag,
			undefined,
			{ limit: query.limit },
		);

		return { meals };
	} catch (e) {
		return handleApiError(e);
	}
}
