import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { ensureProvisionFromCargo } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.cargo.$id.promote";

/**
 * POST /api/mobile/v1/cargo/:id/promote — Add to Galley (unit-portion provision).
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const cargoId = params.id;
	if (!cargoId) {
		throw data({ error: "Missing cargo ID" }, { status: 400 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{ user: { id: userId } },
		);

		const result = await ensureProvisionFromCargo(
			context.cloudflare.env,
			organizationId,
			cargoId,
			flagContext,
		);

		if (!result.provision) {
			throw data({ error: "Cargo item not found" }, { status: 404 });
		}

		return {
			provision: result.provision,
			alreadyExisted: result.alreadyExisted,
			normalized: result.normalized,
		};
	} catch (e) {
		if (
			e instanceof Error &&
			e.message === "Cargo item not found or unauthorized"
		) {
			throw data({ error: "Cargo item not found" }, { status: 404 });
		}
		return handleApiError(e);
	}
}
