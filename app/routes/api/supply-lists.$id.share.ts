import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { generateShareToken, revokeShareToken } from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id.share";

/**
 * POST /api/grocery-lists/:id/share - Generate share token
 * DELETE /api/grocery-lists/:id/share - Revoke share token
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

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

	try {
		if (request.method === "POST") {
			const tierLimits = await getGroupTierLimits(
				context.cloudflare.env,
				groupId,
			);
			if (!tierLimits.limits.canShareGroceryLists) {
				return data(
					{
						error: "feature_gated",
						feature: "share_grocery_list",
						tier: tierLimits.tier,
						upgradePath: "crew_member",
					},
					{ status: 403 },
				);
			}

			const { shareToken, shareExpiresAt } = await generateShareToken(
				context.cloudflare.env.DB,
				groupId,
				listId,
			);

			// Build the share URL
			const url = new URL(request.url);
			const shareUrl = `${url.origin}/shared/${shareToken}`;

			return { shareUrl, shareToken, shareExpiresAt };
		}

		if (request.method === "DELETE") {
			await revokeShareToken(context.cloudflare.env.DB, groupId, listId);
			return { revoked: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
