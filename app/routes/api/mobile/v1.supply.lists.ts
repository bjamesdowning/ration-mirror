import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	handleSupplyCatalogCreate,
	handleSupplyCatalogGet,
} from "~/lib/supply-list-http.server";
import type { Route } from "./+types/v1.supply.lists";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;
	return handleSupplyCatalogGet({
		env,
		request,
		userId,
		organizationId,
		flagContext: buildMobileFlagContext(request, env, { user: { id: userId } }),
	});
}

export async function action({ request, context }: Route.ActionArgs) {
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;
	return handleSupplyCatalogCreate(
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
