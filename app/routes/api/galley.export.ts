import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { exportGalleyAsJson } from "~/lib/export.server";
import { getGalleyForExport } from "~/lib/galley.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/galley.export";

/**
 * GET /api/galley/export - Export galley as JSON (session auth, for Galley page Export button).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"api_export",
		session.user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many export requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const manifest = await getGalleyForExport(context.cloudflare.env.DB, groupId);
	const json = exportGalleyAsJson(manifest);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(json, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-galley-${date}.json"`,
		},
	});
}
