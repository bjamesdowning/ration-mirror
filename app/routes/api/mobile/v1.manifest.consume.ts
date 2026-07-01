import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { consumeManifestEntries, ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { ConsumeEntriesRequestSchema } from "~/lib/schemas/manifest";
import { storeUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.manifest.consume";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const { entryIds } = ConsumeEntriesRequestSchema.parse(body);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const result = await consumeManifestEntries(
			context.cloudflare.env,
			organizationId,
			plan.id,
			entryIds,
		);

		let undoToken: string | undefined;
		if (result.consumed > 0) {
			try {
				undoToken = await storeUndoToken(context.cloudflare.env.RATION_KV, {
					userId,
					organizationId,
					kind: "manifest_consume",
					deductions: result.deductions,
					manifestEntryIds: result.entryIds,
					planId: result.planId,
				});
			} catch (kvErr) {
				log.warn("manifest consume undo token store failed", {
					userId: redactId(userId),
					organizationId: redactId(organizationId),
					detail: kvErr instanceof Error ? kvErr.message : String(kvErr),
				});
			}
		}

		return { consumed: result.consumed, undoToken };
	} catch (e) {
		return handleApiError(e);
	}
}
