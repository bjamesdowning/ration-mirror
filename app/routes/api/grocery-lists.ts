import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { createGroceryList, getGroceryLists } from "~/lib/grocery.server";
import { GroceryListSchema } from "~/lib/schemas/grocery";

/**
 * GET /api/grocery-lists - List all grocery lists for the user
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const { user } = await requireAuth(context, request);

	const lists = await getGroceryLists(context.cloudflare.env.DB, user.id);
	return { lists };
}

/**
 * POST /api/grocery-lists - Create a new grocery list
 */
export async function action({ request, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const json = await request.json();
		const input = GroceryListSchema.parse(json);
		const list = await createGroceryList(
			context.cloudflare.env.DB,
			user.id,
			input,
		);
		return { list };
	} catch (e) {
		return handleApiError(e);
	}
}
