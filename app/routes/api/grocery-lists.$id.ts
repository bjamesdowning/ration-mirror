import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	deleteGroceryList,
	getGroceryList,
	updateGroceryList,
} from "~/lib/grocery.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { GroceryListSchema } from "~/lib/schemas/grocery";
import type { Route } from "./+types/grocery-lists.$id";

/**
 * GET /api/grocery-lists/:id - Get a single grocery list with items
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	const list = await getGroceryList(context.cloudflare.env.DB, groupId, listId);

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

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
