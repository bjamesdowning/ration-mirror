import { API_SCOPES, requireApiKey } from "~/lib/api-key.server";
import { exportSupplyAsCsv } from "~/lib/export.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
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
		return rateLimitResponse(rateLimitResult, "Too many requests", {
			includeBodyMetadata: true,
		});
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
