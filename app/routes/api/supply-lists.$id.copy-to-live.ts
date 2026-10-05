import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { handleSupplyCopyToLive } from "~/lib/supply-list-http.server";
import type { Route } from "./+types/supply-lists.$id.copy-to-live";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	if (!params.id) throw data({ error: "List ID required" }, { status: 400 });
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	return handleSupplyCopyToLive(
		{
			env,
			request,
			userId: user.id,
			organizationId: groupId,
			flagContext: buildWebFlagContext(request, env, { user }),
		},
		params.id,
		await request.json().catch(() => ({})),
	);
}
