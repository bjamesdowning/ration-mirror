import { data } from "react-router";
import { checkCapacity } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { getActiveMealIds } from "~/lib/meal-selection.server";
import { createMeal, getMeals, getMealsCount } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	MobileCreateMealSchema,
	MobileMealsListQuerySchema,
} from "~/lib/schemas/mobile/meals";
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
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Content-Type": "application/json" } },
			);
		}

		const url = new URL(request.url);
		const query = MobileMealsListQuerySchema.parse({
			limit: url.searchParams.get("limit") ?? undefined,
			tag: url.searchParams.get("tag") ?? undefined,
			domain: url.searchParams.get("domain") ?? undefined,
		});

		const [meals, total, activeMealIds] = await Promise.all([
			getMeals(
				context.cloudflare.env.DB,
				organizationId,
				query.tag,
				query.domain,
				{ limit: query.limit },
			),
			getMealsCount(context.cloudflare.env.DB, organizationId),
			getActiveMealIds(context.cloudflare.env.DB, organizationId),
		]);

		return { meals, total, activeMealIds };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
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

		const body = await request.json();
		const input = MobileCreateMealSchema.parse(body);

		const capacity = await checkCapacity(
			context.cloudflare.env,
			organizationId,
			"meals",
			1,
		);
		if (!capacity.allowed) {
			throw data(
				{
					error: "capacity_exceeded",
					resource: "meals",
					current: capacity.current,
					limit: capacity.limit,
					tier: capacity.tier,
					isExpired: capacity.isExpired,
					canAdd: capacity.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}

		const meal = await createMeal(
			context.cloudflare.env.DB,
			organizationId,
			input,
		);
		return { meal };
	} catch (e) {
		return handleApiError(e);
	}
}
