import { data } from "react-router";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { handleSupplyFromReceipt } from "~/lib/supply-list-http.server";
import type { Route } from "./+types/v1.supply.lists.from-receipt";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;
	return handleSupplyFromReceipt(
		{
			env,
			request,
			userId,
			organizationId,
			flagContext: buildMobileFlagContext(request, env, {
				user: { id: userId },
			}),
		},
		await request.json(),
	);
}
