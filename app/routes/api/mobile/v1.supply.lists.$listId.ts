import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { SupplyListSchema } from "~/lib/schemas/supply";
import {
	deleteSupplyList,
	getSupplyListById,
	updateSupplyList,
} from "~/lib/supply.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import type { Route } from "./+types/v1.supply.lists.$listId";

export async function loader({ request, context, params }: Route.LoaderArgs) {
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
		});
		const list = await getSupplyListById(env.DB, organizationId, listId);
		if (!list) throw data({ error: "Grocery list not found" }, { status: 404 });
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function action({ request, context, params }: Route.ActionArgs) {
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
		});
		if (request.method === "PUT") {
			const input = SupplyListSchema.parse(await request.json());
			const list = await updateSupplyList(
				env.DB,
				organizationId,
				listId,
				input,
			);
			return { list };
		}
		if (request.method === "DELETE") {
			await deleteSupplyList(env.DB, organizationId, listId);
			return { deleted: true };
		}
		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (error) {
		return handleApiError(error);
	}
}
