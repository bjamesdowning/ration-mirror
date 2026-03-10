import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
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
		const { groupId, session } = await requireActiveGroup(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"cargo_list",
			session.user.id,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please slow down." },
				{
					status: 429,
					headers: {
						"Retry-After": String(rateLimitResult.retryAfter ?? 60),
					},
				},
			);
		}

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
