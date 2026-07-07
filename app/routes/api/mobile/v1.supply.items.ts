import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileCreateSupplyItemSchema } from "~/lib/schemas/mobile/supply";
import { addSupplyItem, getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.items";

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
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
		if (!list) {
			throw data({ error: "Supply list not found" }, { status: 404 });
		}

		const body = await request.json();
		const input = MobileCreateSupplyItemSchema.parse(body);
		const item = await addSupplyItem(
			context.cloudflare.env.DB,
			organizationId,
			list.id,
			input,
		);
		return { item };
	} catch (e) {
		return handleApiError(e);
	}
}
