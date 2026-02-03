import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	deleteGroceryList,
	getGroceryList,
	updateGroceryList,
} from "~/lib/grocery.server";
import { GroceryListSchema } from "~/lib/schemas/grocery";

/**
 * GET /api/grocery-lists/:id - Get a single grocery list with items
 */
export async function loader({ request, context, params }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	const list = await getGroceryList(context.cloudflare.env.DB, groupId, listId);

	if (!list) {
		throw new Response("Grocery list not found", { status: 404 });
	}

	return { list };
}

/**
 * PUT /api/grocery-lists/:id - Update grocery list metadata
 * DELETE /api/grocery-lists/:id - Delete grocery list
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	try {
		if (request.method === "PUT") {
			const json = await request.json();
			const input = GroceryListSchema.parse(json);
			const list = await updateGroceryList(
				context.cloudflare.env.DB,
				groupId,
				listId,
				input,
			);
			return { list };
		}

		if (request.method === "DELETE") {
			await deleteGroceryList(context.cloudflare.env.DB, groupId, listId);
			return { deleted: true };
		}

		throw new Response("Method not allowed", { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
