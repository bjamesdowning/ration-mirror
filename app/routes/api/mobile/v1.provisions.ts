import { data } from "react-router";
import { checkCapacity } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { createProvision } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileProvisionSchema } from "~/lib/schemas/mobile/meals";
import type { Route } from "./+types/v1.provisions";

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
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const input = MobileProvisionSchema.parse(body);

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

		const provision = await createProvision(
			context.cloudflare.env.DB,
			organizationId,
			input,
			context.cloudflare.env,
		);
		return { provision };
	} catch (e) {
		return handleApiError(e);
	}
}
