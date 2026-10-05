import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	MobileSnoozeItemSchema,
	MobileUpdateSupplyItemSchema,
} from "~/lib/schemas/mobile/supply";
import {
	deleteSupplyItem,
	snoozeSupplyItem,
	updateSupplyItem,
} from "~/lib/supply.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import type { Route } from "./+types/v1.supply.lists.$listId.items.$itemId";

export async function action({ request, context, params }: Route.ActionArgs) {
	const listId = params.listId;
	const itemId = params.itemId;
	if (!listId || !itemId) {
		throw data({ error: "List and item ID required" }, { status: 400 });
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
		const env = context.cloudflare.env;
		await resolveSupplyListTarget({
			env,
			organizationId,
			listId,
			flagContext: buildMobileFlagContext(request, env, {
				user: { id: userId },
			}),
			allowedStates: request.method === "POST" ? ["live"] : ["live", "saved"],
		});
		if (request.method === "DELETE") {
			await deleteSupplyItem(env.DB, organizationId, listId, itemId);
			return { success: true };
		}
		if (request.method === "PATCH") {
			const input = MobileUpdateSupplyItemSchema.parse(await request.json());
			const item = await updateSupplyItem(
				env.DB,
				organizationId,
				listId,
				itemId,
				input,
			);
			return { item };
		}
		if (request.method === "POST") {
			const { duration } = MobileSnoozeItemSchema.parse(await request.json());
			return snoozeSupplyItem(env.DB, organizationId, listId, itemId, duration);
		}
		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (error) {
		return handleApiError(error);
	}
}
