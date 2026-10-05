import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileCreateSupplyItemSchema } from "~/lib/schemas/mobile/supply";
import { addSupplyItem } from "~/lib/supply.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import type { Route } from "./+types/v1.supply.lists.$listId.items";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const listId = params.listId;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });
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
			allowedStates: ["live", "saved"],
		});
		const input = MobileCreateSupplyItemSchema.parse(await request.json());
		const item = await addSupplyItem(env.DB, organizationId, listId, input);
		return { item };
	} catch (error) {
		return handleApiError(error);
	}
}
