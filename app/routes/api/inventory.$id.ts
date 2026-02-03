import type { ActionFunctionArgs } from "react-router";
import { data as json } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/auth.server";
import { InventoryItemSchema, updateItem } from "~/lib/inventory.server";

const PartialInventorySchema = InventoryItemSchema.partial();

export async function action({ request, params, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw new Response("Not Found", { status: 404 });

	if (request.method !== "PUT") {
		return json({ error: "Method not allowed" }, 405);
	}

	try {
		const payload = await request.json();
		const input = PartialInventorySchema.parse(payload);

		const updated = await updateItem(
			context.cloudflare.env,
			user.id,
			id,
			input,
		);

		if (!updated) {
			return json({ error: "Item not found" }, 404);
		}

		return json({ success: true, item: updated });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json(
				{ error: "Validation failed", details: error.flatten() },
				400,
			);
		}
		console.error(error);
		return json({ error: "Internal Server Error" }, 500);
	}
}
