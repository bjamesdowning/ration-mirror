import { requireActiveGroup } from "~/lib/auth.server";
import { exportGalleyAsJson } from "~/lib/export.server";
import { getGalleyForExport } from "~/lib/galley.server";
import type { Route } from "./+types/galley.export";

/**
 * GET /api/galley/export - Export galley as JSON (session auth, for Galley page Export button).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

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
