import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { ActionFunctionArgs } from "react-router";
import { groceryItem } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { dockGroceryItems } from "~/lib/inventory.server";

/**
 * POST /api/grocery-lists/:id/complete
 * Docks all purchased items from the list into inventory and removes them from the list.
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;
	console.log(`[DOCK] Request for list: ${listId}, Group: ${groupId}`);

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const d1 = drizzle(context.cloudflare.env.DB);

		// 1. Get purchased items
		const purchasedItems = await d1
			.select()
			.from(groceryItem)
			.where(
				and(eq(groceryItem.listId, listId), eq(groceryItem.isPurchased, true)),
			);

		console.log(`[DOCK] Found ${purchasedItems.length} purchased items`);

		if (purchasedItems.length === 0) {
			return {
				docked: 0,
				created: 0,
				message: "No purchased items to dock",
			};
		}

		// 2. Dock them
		const results = await dockGroceryItems(
			context.cloudflare.env.DB,
			groupId,
			purchasedItems,
		);

		// 3. Remove them from the list (cleanup)
		// We delete them one by one or by ID list to ensure we only delete what we processed
		if (purchasedItems.length > 0) {
			const _itemIds = purchasedItems.map((i) => i.id);
			// Verify batch delete syntax for SQLite/Drizzle, simple loop is safest for D1 limits
			for (const item of purchasedItems) {
				await d1.delete(groceryItem).where(eq(groceryItem.id, item.id));
			}
		}

		return {
			docked: results.updated + results.created,
			summary: results,
		};
	} catch (e) {
		console.error("[DOCK] Error:", e);
		return handleApiError(e);
	}
}
