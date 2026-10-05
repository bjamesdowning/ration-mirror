import { data } from "react-router";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { handleSupplyBulkAdd } from "~/lib/supply-list-http.server";
import type { Route } from "./+types/v1.supply.lists.$listId.bulk-add";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const listId = params.listId;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;
	return handleSupplyBulkAdd(
		{
			env,
			request,
			userId,
			organizationId,
			flagContext: buildMobileFlagContext(request, env, {
				user: { id: userId },
			}),
		},
		listId,
		await request.json().catch(() => ({})),
	);
}
