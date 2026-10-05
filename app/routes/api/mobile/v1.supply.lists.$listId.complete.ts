import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { completeSupplyList } from "~/lib/supply.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/v1.supply.lists.$listId.complete";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const listId = params.listId;
		if (!listId) throw data({ error: "List ID required" }, { status: 400 });
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
		const userSettings = await getUserSettings(env.DB, userId);
		const result = await completeSupplyList(env, organizationId, listId, {
			unitMode: resolveUnitDisplayMode(userSettings),
			userId,
		});
		return {
			success: true,
			docked: result.docked,
			message: result.message,
		};
	} catch (error) {
		return handleApiError(error);
	}
}
