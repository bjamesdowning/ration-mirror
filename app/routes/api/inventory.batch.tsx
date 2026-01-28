import { requireAuth } from "~/lib/auth.server";
import { addItem } from "~/lib/inventory.server";
import { data } from "~/lib/response";
import { BatchAddInventorySchema } from "~/lib/schemas/scan";
import type { Route } from "./+types/inventory.batch";

/**
 * Batch add multiple items to inventory from scan results
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	try {
		const body = await request.json();
		const result = BatchAddInventorySchema.safeParse(body);

		if (!result.success) {
			throw data(
				{ error: "Invalid request", issues: result.error.flatten() },
				{ status: 400 },
			);
		}

		const { items } = result.data;

		// Add each item to inventory
		const addedItems = [];
		const errors = [];

		for (const item of items) {
			try {
				const [newItem] = await addItem(context.cloudflare.env, userId, item);
				addedItems.push(newItem);
			} catch (error) {
				console.error(`Failed to add item ${item.name}:`, error);
				errors.push({
					name: item.name,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return {
			success: true,
			added: addedItems.length,
			total: items.length,
			items: addedItems,
			errors: errors.length > 0 ? errors : undefined,
		};
	} catch (error) {
		console.error("Batch add failed:", error);
		if (error instanceof Response) {
			throw error;
		}
		throw data({ error: "Failed to add items" }, { status: 500 });
	}
}
