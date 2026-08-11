import { data } from "react-router";
import {
	QuickEatNotFoundError,
	QuickEatValidationError,
	quickEatFromCargo,
} from "~/lib/cargo-quick-eat.server";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CargoQuickEatRequestSchema } from "~/lib/schemas/cargo-quick-eat";
import type { Route } from "./+types/v1.cargo.$id.quick-eat";

/**
 * POST /api/mobile/v1/cargo/:id/quick-eat
 * Atomic snack: ensure provision → Manifest snack → Cook (silent partial) → optional intake.
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

		const body = await request.json();
		const input = CargoQuickEatRequestSchema.parse(body);
		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{ user: { id: userId } },
		);
		const principal = {
			userId,
			organizationId,
			surface: "mobile" as const,
			authMethod: "mobile_bearer" as const,
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		const result = await quickEatFromCargo(
			context.cloudflare.env,
			organizationId,
			principal,
			flagContext,
			{
				cargoId,
				quantity: input.quantity,
				unit: input.unit,
				date: input.date,
				operationKey: input.operationKey,
				logIntake: input.logIntake,
				notes: input.notes,
				source: "mobile",
			},
		);

		return result;
	} catch (e) {
		if (e instanceof QuickEatNotFoundError) {
			throw data({ error: e.message, code: e.code }, { status: 404 });
		}
		if (e instanceof QuickEatValidationError) {
			throw data({ error: e.message, code: e.code }, { status: 400 });
		}
		return handleApiError(e);
	}
}
