import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { handleSupplyFromReceipt } from "~/lib/supply-list-http.server";
import type { Route } from "./+types/supply-lists.from-receipt";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	return handleSupplyFromReceipt(
		{
			env,
			request,
			userId: user.id,
			organizationId: groupId,
			flagContext: buildWebFlagContext(request, env, { user }),
		},
		await request.json(),
	);
}
