import { data } from "react-router";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	generateShareToken,
	getSupplyList,
	revokeShareToken,
} from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.share";

function absoluteShareUrl(request: Request, token: string): string {
	const origin = new URL(request.url).origin;
	return `${origin}/shared/${token}`;
}

/** POST/DELETE /api/mobile/v1/supply/share — Crew-gated supply list sharing. */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
		if (!list) {
			throw data({ error: "Supply list not found" }, { status: 404 });
		}

		if (request.method === "POST") {
			const tierLimits = await getGroupTierLimits(
				context.cloudflare.env,
				organizationId,
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
				organizationId,
				list.id,
			);

			return {
				shareToken,
				shareUrl: absoluteShareUrl(request, shareToken),
				shareExpiresAt: shareExpiresAt.toISOString(),
			};
		}

		if (request.method === "DELETE") {
			await revokeShareToken(
				context.cloudflare.env.DB,
				organizationId,
				list.id,
			);
			return { revoked: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}

/** GET — current share state for active org supply list. */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
		if (!list?.shareToken) {
			return {
				shareUrl: null as string | null,
				shareExpiresAt: null as string | null,
			};
		}
		return {
			shareUrl: absoluteShareUrl(request, list.shareToken),
			shareExpiresAt: list.shareExpiresAt?.toISOString() ?? null,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
