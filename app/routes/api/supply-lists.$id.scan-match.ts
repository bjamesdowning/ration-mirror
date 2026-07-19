import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SupplyScanMatchQuerySchema } from "~/lib/schemas/supply-scan";
import { getSupplyScanMatch, SupplyScanError } from "~/lib/supply-scan.server";
import type { Route } from "./+types/supply-lists.$id.scan-match";

/**
 * GET /api/supply-lists/:id/scan-match?requestId=
 * Returns server-side receipt ↔ supply pairings for the acceptance review UI.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const listId = params.id;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });

	await assertFeatureEnabled(
		env,
		"ai-dock-from-receipt",
		buildFlagContext(request, env, { user }),
	);

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"status_poll",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	const url = new URL(request.url);
	const parsed = SupplyScanMatchQuerySchema.safeParse({
		requestId: url.searchParams.get("requestId"),
	});
	if (!parsed.success) {
		throw data(
			{ error: "Invalid requestId", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		return await getSupplyScanMatch(
			env,
			groupId,
			listId,
			parsed.data.requestId,
		);
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "job_not_found" || e.code === "list_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
		return handleApiError(e);
	}
}
