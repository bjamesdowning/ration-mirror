import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	ConvertSupplyUnitSchema,
	SnoozeItemSchema,
	SupplyItemUpdateSchema,
} from "~/lib/schemas/supply";
import {
	convertSupplyItemUnit,
	deleteSupplyItem,
	snoozeSupplyItem,
	updateSupplyItem,
} from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id.items.$itemId";

/**
 * PUT /api/supply-lists/:id/items/:itemId - Update supply item
 * POST /api/supply-lists/:id/items/:itemId - Snooze supply item (meal-sourced)
 * DELETE /api/supply-lists/:id/items/:itemId - Remove supply item
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const listId = params.id;
	const itemId = params.itemId;

	if (!listId || !itemId) {
		throw data({ error: "List and Item ID required" }, { status: 400 });
	}

	let groupId: string;
	let userId: string;

	try {
		const result = await requireActiveGroup(context, request);
		groupId = result.groupId;
		userId = result.session.user.id;
	} catch (e) {
		if (e instanceof Response) throw e;
		return handleApiError(e);
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		userId,
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
			const input = SupplyItemUpdateSchema.parse(json);
			const item = await updateSupplyItem(
				context.cloudflare.env.DB,
				groupId,
				listId,
				itemId,
				input,
			);
			return { item };
		}

		if (request.method === "POST") {
			const json = await request.json();
			if (json && typeof json === "object" && "intent" in json) {
				const input = ConvertSupplyUnitSchema.parse(json);
				const item = await convertSupplyItemUnit(
					context.cloudflare.env.DB,
					groupId,
					listId,
					itemId,
					input.mode,
					input.preferredSystem,
				);
				return { item };
			}
			const { duration } = SnoozeItemSchema.parse(json);
			const result = await snoozeSupplyItem(
				context.cloudflare.env.DB,
				groupId,
				listId,
				itemId,
				duration,
			);
			return result;
		}

		if (request.method === "DELETE") {
			await deleteSupplyItem(
				context.cloudflare.env.DB,
				groupId,
				listId,
				itemId,
			);
			return { deleted: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
