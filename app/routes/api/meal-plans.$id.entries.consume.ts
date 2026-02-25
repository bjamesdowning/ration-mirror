import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { consumeManifestEntries } from "~/lib/manifest.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { ConsumeEntriesRequestSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries.consume";

/**
 * POST /api/meal-plans/:id/entries/consume — Consume selected manifest entries,
 * deduct ingredients from Cargo, and mark entries as consumed.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const planId = params.id;
	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		const json = await request.json();
		const parsed = ConsumeEntriesRequestSchema.safeParse(json);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}
		const { entryIds } = parsed.data;

		const result = await consumeManifestEntries(
			context.cloudflare.env.DB,
			groupId,
			planId,
			entryIds,
		);

		return { consumed: result.consumed };
	} catch (e) {
		return handleApiError(e);
	}
}
