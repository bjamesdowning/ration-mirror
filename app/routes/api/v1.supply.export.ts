import { API_SCOPES, requireApiKey } from "~/lib/api-key.server";
import { exportSupplyAsCsv } from "~/lib/export.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.export";

/**
 * GET /api/v1/supply/export - Export supply list as CSV (API key auth).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { organizationId, apiKeyId } = await requireApiKey(
		context,
		request,
		API_SCOPES.supply,
	);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"api_export",
		apiKeyId,
	);
	if (!rateLimitResult.allowed) {
		return new Response(
			JSON.stringify({
				error: "Too many requests",
				retryAfter: rateLimitResult.retryAfter,
			}),
			{
				status: 429,
				headers: {
					"Content-Type": "application/json",
					"Retry-After": String(rateLimitResult.retryAfter ?? 60),
				},
			},
		);
	}

	const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
	if (!list) {
		return new Response(JSON.stringify({ error: "Supply list not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	const csv = exportSupplyAsCsv(list);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-supply-${date}.csv"`,
		},
	});
}
