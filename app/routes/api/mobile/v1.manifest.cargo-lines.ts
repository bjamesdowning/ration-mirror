import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { assertPlanFuelActions } from "~/lib/nutrition/fast-log-flag.server";
import { addCargoLine } from "~/lib/plan-fuel-actions.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import type { Route } from "./+types/v1.manifest.cargo-lines";

const Body = z.object({
	cargoId: z.string().uuid(),
	date: z.string(),
	slotType: z.enum(SLOT_TYPES),
	quantity: z.number().positive(),
	notes: z.string().max(500).nullable().optional(),
});

/** POST /api/mobile/v1/manifest/cargo-lines — plan a cargo item. No deduct, no Fuel log. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const flags = buildMobileFlagContext(request, context.cloudflare.env, {
			user: { id: userId },
		});
		await assertPlanFuelActions(context.cloudflare.env, flags);
		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}
		const input = Body.parse(await request.json());
		const line = await addCargoLine(
			context.cloudflare.env.DB,
			organizationId,
			input,
		);
		return { line };
	} catch (error) {
		return handleApiError(error);
	}
}
