import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	MobileSnoozeItemSchema,
	MobileUpdateSupplyItemSchema,
} from "~/lib/schemas/mobile/supply";
import {
	deleteSupplyItem,
	getSupplyList,
	snoozeSupplyItem,
	updateSupplyItem,
} from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.items.$id";

export async function action({ request, context, params }: Route.ActionArgs) {
	const itemId = params.id;
	if (!itemId) {
		throw data({ error: "Item id required" }, { status: 400 });
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
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
		if (!list) {
			throw data({ error: "Supply list not found" }, { status: 404 });
		}

		if (request.method === "DELETE") {
			await deleteSupplyItem(
				context.cloudflare.env.DB,
				organizationId,
				list.id,
				itemId,
			);
			return { success: true };
		}

		if (request.method === "PATCH") {
			const body = await request.json();
			const input = MobileUpdateSupplyItemSchema.parse(body);
			const item = await updateSupplyItem(
				context.cloudflare.env.DB,
				organizationId,
				list.id,
				itemId,
				input,
			);
			return { item };
		}

		if (request.method === "POST") {
			const body = await request.json();
			const { duration } = MobileSnoozeItemSchema.parse(body);
			const result = await snoozeSupplyItem(
				context.cloudflare.env.DB,
				organizationId,
				list.id,
				itemId,
				duration,
			);
			return result;
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
