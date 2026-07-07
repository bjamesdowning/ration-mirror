import { API_SCOPES, requireApiKey } from "~/lib/api-key.server";
import { exportGalleyAsJson } from "~/lib/export.server";
import { getGalleyForExport } from "~/lib/galley.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.galley.export";

/**
 * GET /api/v1/galley/export - Export galley as JSON (API key auth).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { organizationId, apiKeyId } = await requireApiKey(
		context,
		request,
		API_SCOPES.galley,
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

	const manifest = await getGalleyForExport(
		context.cloudflare.env.DB,
		organizationId,
	);
	const json = exportGalleyAsJson(manifest);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(json, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-galley-${date}.json"`,
		},
	});
}
