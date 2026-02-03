import type { ActionFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { deleteGroceryItem, updateGroceryItem } from "~/lib/grocery.server";
import { GroceryItemUpdateSchema } from "~/lib/schemas/grocery";

/**
 * PUT /api/grocery-lists/:id/items/:itemId - Update grocery item
 * DELETE /api/grocery-lists/:id/items/:itemId - Remove grocery item
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;
	const itemId = params.itemId;

	if (!listId || !itemId) {
		throw new Response("List ID and Item ID required", { status: 400 });
	}

	try {
		if (request.method === "PUT") {
			const json = await request.json();
			const input = GroceryItemUpdateSchema.parse(json);
			const item = await updateGroceryItem(
				context.cloudflare.env.DB,
				groupId,
				listId,
				itemId,
				input,
			);
			return { item };
		}

		if (request.method === "DELETE") {
			await deleteGroceryItem(
				context.cloudflare.env.DB,
				groupId,
				listId,
				itemId,
			);
			return { deleted: true };
		}

		throw new Response("Method not allowed", { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
