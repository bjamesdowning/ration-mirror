import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	canShareMealPlan,
	generateShareToken,
	getMealPlanById,
	revokeShareToken,
} from "~/lib/manifest.server";
import type { Route } from "./+types/meal-plans.$id.share";

/**
 * POST /api/meal-plans/:id/share — Generate a share token (crew_member only).
 * DELETE /api/meal-plans/:id/share — Revoke the share token.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const planId = params.id;

	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	const plan = await getMealPlanById(
		context.cloudflare.env.DB,
		groupId,
		planId,
	);
	if (!plan) throw data({ error: "Meal plan not found" }, { status: 404 });

	if (request.method === "POST") {
		try {
			const canShare = await canShareMealPlan(
				context.cloudflare.env.DB,
				groupId,
			);
			if (!canShare) {
				return data({ error: "feature_gated" }, { status: 403 });
			}

			const { shareToken, shareExpiresAt } = await generateShareToken(
				context.cloudflare.env.DB,
				groupId,
				planId,
			);

			const shareUrl = `/shared/manifest/${shareToken}`;
			return { shareToken, shareUrl, shareExpiresAt };
		} catch (e) {
			return handleApiError(e);
		}
	}

	if (request.method === "DELETE") {
		try {
			await revokeShareToken(context.cloudflare.env.DB, groupId, planId);
			return { revoked: true };
		} catch (e) {
			return handleApiError(e);
		}
	}

	throw data({ error: "Method not allowed" }, { status: 405 });
}
