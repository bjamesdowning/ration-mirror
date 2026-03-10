import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import type { Route } from "./+types/cargo";

/**
 * GET /api/cargo — slim inventory list for client-side use.
 * Returns only the fields needed by match mode and ingredient pickers:
 * id, name, unit, quantity.
 *
 * Not paginated — capped at 200 rows, matching the former Galley loader limit.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { groupId } = await requireActiveGroup(context, request);
		const rows = await getCargo(context.cloudflare.env.DB, groupId, undefined, {
			limit: 200,
		});
		const items = rows.map(({ id, name, unit, quantity }) => ({
			id,
			name,
			unit,
			quantity,
		}));
		return { items };
	} catch (e) {
		return handleApiError(e);
	}
}
