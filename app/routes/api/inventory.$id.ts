import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { InventoryItemSchema, updateItem } from "~/lib/inventory.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/inventory.$id";

const PartialInventorySchema = InventoryItemSchema.partial();

export async function action({ request, params, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"inventory_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	if (request.method !== "PUT") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const payload = await request.json();
		const input = PartialInventorySchema.parse(payload);

		const updated = await updateItem(
			context.cloudflare.env,
			groupId,
			id,
			input,
		);

		if (!updated) {
			return data({ error: "Item not found" }, { status: 404 });
		}

		return data({ success: true, item: updated });
	} catch (e) {
		return handleApiError(e);
	}
}
