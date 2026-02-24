import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { deleteEntry, updateEntry } from "~/lib/manifest.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealPlanEntryUpdateSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries.$entryId";

/**
 * PATCH /api/meal-plans/:id/entries/:entryId — Update an entry.
 * DELETE /api/meal-plans/:id/entries/:entryId — Remove an entry.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const planId = params.id;
	const entryId = params.entryId;
	if (!planId || !entryId) {
		throw data({ error: "Plan and entry IDs required" }, { status: 400 });
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

	if (request.method === "DELETE") {
		try {
			const deleted = await deleteEntry(
				context.cloudflare.env.DB,
				groupId,
				planId,
				entryId,
			);
			if (!deleted) throw data({ error: "Entry not found" }, { status: 404 });
			return { deleted: true };
		} catch (e) {
			return handleApiError(e);
		}
	}

	if (request.method === "PATCH") {
		try {
			const json = await request.json();
			const input = MealPlanEntryUpdateSchema.parse(json);

			const updated = await updateEntry(
				context.cloudflare.env.DB,
				groupId,
				planId,
				entryId,
				input,
			);

			if (!updated) throw data({ error: "Entry not found" }, { status: 404 });
			return { entry: updated };
		} catch (e) {
			return handleApiError(e);
		}
	}

	throw data({ error: "Method not allowed" }, { status: 405 });
}
