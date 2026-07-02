import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { deleteEntry, ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.manifest.entries.$entryId";

/** DELETE /api/mobile/v1/manifest/entries/:entryId — Remove a manifest entry. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const entryId = params.entryId;
	if (!entryId) {
		throw data({ error: "Entry ID required" }, { status: 400 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

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

		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);

		const deleted = await deleteEntry(
			context.cloudflare.env.DB,
			organizationId,
			plan.id,
			entryId,
		);
		if (!deleted) {
			throw data({ error: "Entry not found" }, { status: 404 });
		}

		return { deleted: true };
	} catch (e) {
		return handleApiError(e);
	}
}
