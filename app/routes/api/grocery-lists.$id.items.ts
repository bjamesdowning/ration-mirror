import type { ActionFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { addGroceryItem } from "~/lib/grocery.server";
import { GroceryItemSchema } from "~/lib/schemas/grocery";

/**
 * POST /api/grocery-lists/:id/items - Add item to grocery list
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const json = await request.json();
		const input = GroceryItemSchema.parse(json);
		const item = await addGroceryItem(
			context.cloudflare.env.DB,
			groupId,
			listId,
			input,
		);
		return { item };
	} catch (e) {
		return handleApiError(e);
	}
}
