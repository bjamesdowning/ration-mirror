import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { getSupplyList } from "~/lib/grocery.server";

/**
 * GET /api/grocery-lists - Get the singleton Supply list
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const list = await getSupplyList(context.cloudflare.env.DB, groupId);
	return { list };
}

/**
 * POST /api/grocery-lists - Ensure the Supply list exists (Idempotent)
 */
export async function action({ request, context }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		// We ignore the input name, as "Supply" is enforced
		const list = await getSupplyList(context.cloudflare.env.DB, groupId);
		return { list };
	} catch (e) {
		return handleApiError(e);
	}
}
