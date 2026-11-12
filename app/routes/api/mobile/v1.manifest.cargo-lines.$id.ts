import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { assertPlanFuelActions } from "~/lib/nutrition/fast-log-flag.server";
import {
	deleteCargoLine,
	updateCargoLine,
} from "~/lib/plan-fuel-actions.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import type { Route } from "./+types/v1.manifest.cargo-lines.$id";

const Body = z.object({
	date: z.string().optional(),
	slotType: z.enum(SLOT_TYPES).optional(),
	quantity: z.number().positive().optional(),
	notes: z.string().max(500).nullable().optional(),
});

/** PATCH or DELETE /api/mobile/v1/manifest/cargo-lines/:id */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "PATCH" && request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const lineId = params.id;
	if (!lineId) throw data({ error: "Missing line id" }, { status: 400 });
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
		if (request.method === "DELETE") {
			const deleted = await deleteCargoLine(
				context.cloudflare.env.DB,
				organizationId,
				lineId,
			);
			if (!deleted)
				throw data({ error: "Plan line not found" }, { status: 404 });
			return { deleted: true };
		}
		const input = Body.parse(await request.json());
		const line = await updateCargoLine(
			context.cloudflare.env.DB,
			organizationId,
			lineId,
			input,
		);
		return { line };
	} catch (error) {
		return handleApiError(error);
	}
}
