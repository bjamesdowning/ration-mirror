import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { getSupplyList } from "~/lib/grocery.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/grocery-lists";

/**
 * GET /api/grocery-lists - Get the singleton Supply list
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const list = await getSupplyList(context.cloudflare.env.DB, groupId);
	return { list };
}

/**
 * POST /api/grocery-lists - Ensure the Supply list exists (Idempotent)
 */
export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		// We ignore the input name, as "Supply" is enforced
		const list = await getSupplyList(context.cloudflare.env.DB, groupId);
		return { list };
	} catch (e) {
		return handleApiError(e);
	}
}
