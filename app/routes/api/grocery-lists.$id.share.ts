import type { ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { generateShareToken, revokeShareToken } from "~/lib/grocery.server";

/**
 * POST /api/grocery-lists/:id/share - Generate share token
 * DELETE /api/grocery-lists/:id/share - Revoke share token
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	try {
		if (request.method === "POST") {
			const { shareToken, shareExpiresAt } = await generateShareToken(
				context.cloudflare.env.DB,
				user.id,
				listId,
			);

			// Build the share URL
			const url = new URL(request.url);
			const shareUrl = `${url.origin}/shared/${shareToken}`;

			return { shareUrl, shareToken, shareExpiresAt };
		}

		if (request.method === "DELETE") {
			await revokeShareToken(context.cloudflare.env.DB, user.id, listId);
			return { revoked: true };
		}

		throw new Response("Method not allowed", { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
