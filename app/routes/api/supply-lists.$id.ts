import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { SupplyListSchema } from "~/lib/schemas/supply";
import {
	deleteSupplyList,
	getSupplyListById,
	updateSupplyList,
} from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id";

/**
 * GET /api/grocery-lists/:id - Get a single grocery list with items
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	const list = await getSupplyListById(
		context.cloudflare.env.DB,
		groupId,
		listId,
	);

	if (!list) {
		throw data({ error: "Grocery list not found" }, { status: 404 });
	}

	return { list };
}

/**
 * PUT /api/grocery-lists/:id - Update grocery list metadata
 * DELETE /api/grocery-lists/:id - Delete grocery list
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		if (request.method === "PUT") {
			const json = await request.json();
			const input = SupplyListSchema.parse(json);
			const list = await updateSupplyList(
				context.cloudflare.env.DB,
				groupId,
				listId,
				input,
			);
			return { list };
		}

		if (request.method === "DELETE") {
			await deleteSupplyList(context.cloudflare.env.DB, groupId, listId);
			return { deleted: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
