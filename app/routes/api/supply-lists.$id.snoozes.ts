import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { getActiveSnoozes, getSupplyListById } from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id.snoozes";

/**
 * GET /api/supply-lists/:id/snoozes - List active snoozes for the org
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	try {
		const list = await getSupplyListById(
			context.cloudflare.env.DB,
			groupId,
			listId,
		);
		if (!list) {
			throw data({ error: "Supply list not found" }, { status: 404 });
		}

		const snoozes = await getActiveSnoozes(context.cloudflare.env.DB, groupId);
		return { snoozes };
	} catch (e) {
		return handleApiError(e);
	}
}
