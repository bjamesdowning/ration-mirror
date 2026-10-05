import { data } from "react-router";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	handleSupplyArchive,
	handleSupplyCopyToLive,
	handleSupplyDuplicate,
	handleSupplyFromReceipt,
	handleSupplyOperations,
	handleSupplyResetPurchased,
	handleSupplyTransfer,
} from "~/lib/supply-list-http.server";
import type { Route } from "./+types/v1.supply.lists.$listId.actions";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const actionName = params.action;
	const listId = params.listId;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;
	const slice = {
		env,
		request,
		userId,
		organizationId,
		flagContext: buildMobileFlagContext(request, env, { user: { id: userId } }),
	};
	const body = await request.json().catch(() => ({}));
	if (actionName === "duplicate")
		return handleSupplyDuplicate(slice, listId, body);
	if (actionName === "archive") return handleSupplyArchive(slice, listId);
	if (actionName === "reset-purchased") {
		return handleSupplyResetPurchased(slice, listId);
	}
	if (actionName === "copy-to-live") {
		return handleSupplyCopyToLive(slice, listId, body);
	}
	if (actionName === "transfer")
		return handleSupplyTransfer(slice, listId, body);
	if (actionName === "operations") {
		return handleSupplyOperations(slice, listId, body);
	}
	if (actionName === "from-receipt")
		return handleSupplyFromReceipt(slice, body);
	throw data({ error: "Unknown action" }, { status: 404 });
}
