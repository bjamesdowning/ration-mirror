import { requireActiveGroup } from "~/lib/auth.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import {
	handleSupplyCatalogCreate,
	handleSupplyCatalogGet,
} from "~/lib/supply-list-http.server";
import type { Route } from "./+types/supply-lists.catalog";

function auth(context: Route.LoaderArgs["context"], request: Request) {
	return async () => {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		return {
			env,
			request,
			userId: user.id,
			organizationId: groupId,
			flagContext: buildWebFlagContext(request, env, { user }),
		};
	};
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const slice = await auth(context, request)();
	return handleSupplyCatalogGet(slice);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}
	const slice = await auth(context, request)();
	return handleSupplyCatalogCreate(slice, await request.json());
}
