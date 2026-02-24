import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import { exportCargoAsCsv } from "~/lib/export.server";
import type { Route } from "./+types/cargo.export";

/**
 * GET /api/cargo/export - Export cargo as CSV (session auth, for Cargo page Export button).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const items = await getCargo(context.cloudflare.env.DB, groupId);
	const csv = exportCargoAsCsv(items);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-cargo-${date}.csv"`,
		},
	});
}
