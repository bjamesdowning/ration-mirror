import { requireApiKey } from "~/lib/api-key.server";
import { getCargoWithTags } from "~/lib/cargo.server";
import { exportCargoAsCsv } from "~/lib/export.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.inventory.export";

/**
 * GET /api/v1/inventory/export - Export cargo as CSV (API key auth).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { organizationId, apiKeyId } = await requireApiKey(
		context,
		request,
		"inventory",
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

	const items = await getCargoWithTags(
		context.cloudflare.env.DB,
		organizationId,
	);
	const csv = exportCargoAsCsv(items);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-cargo-${date}.csv"`,
		},
	});
}
