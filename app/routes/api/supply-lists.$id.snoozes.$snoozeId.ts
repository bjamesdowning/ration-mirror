import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { unsnoozeSupplyItem } from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id.snoozes.$snoozeId";

/**
 * DELETE /api/supply-lists/:id/snoozes/:snoozeId - Unsnooze (early expire) a supply item
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;
	const snoozeId = params.snoozeId;

	if (!listId || !snoozeId) {
		throw data({ error: "List ID and Snooze ID required" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		const result = await unsnoozeSupplyItem(
			context.cloudflare.env.DB,
			groupId,
			snoozeId,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
