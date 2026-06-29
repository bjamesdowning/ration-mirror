import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import {
	canShareMealPlan,
	ensureMealPlan,
	generateShareToken,
	getMealPlanById,
	revokeShareToken,
} from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.manifest.share";

function absoluteShareUrl(request: Request, token: string): string {
	const origin = new URL(request.url).origin;
	return `${origin}/shared/manifest/${token}`;
}

/** POST/DELETE /api/mobile/v1/manifest/share — Crew-gated manifest sharing. */
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

		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);

		if (request.method === "POST") {
			const canShare = await canShareMealPlan(
				context.cloudflare.env.DB,
				organizationId,
			);
			if (!canShare) {
				return data({ error: "feature_gated" }, { status: 403 });
			}

			const { shareToken, shareExpiresAt } = await generateShareToken(
				context.cloudflare.env.DB,
				organizationId,
				plan.id,
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
				plan.id,
			);
			return { revoked: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}

/** GET — current share state for active org plan. */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const full = await getMealPlanById(
			context.cloudflare.env.DB,
			organizationId,
			plan.id,
		);
		if (!full?.shareToken) {
			return {
				shareUrl: null as string | null,
				shareExpiresAt: null as string | null,
			};
		}
		return {
			shareUrl: absoluteShareUrl(request, full.shareToken),
			shareExpiresAt: full.shareExpiresAt?.toISOString() ?? null,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
