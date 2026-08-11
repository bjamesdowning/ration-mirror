import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	QuickEatNotFoundError,
	QuickEatValidationError,
	quickEatFromCargo,
} from "~/lib/cargo-quick-eat.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CargoQuickEatRequestSchema } from "~/lib/schemas/cargo-quick-eat";
import type { Route } from "./+types/cargo.$id.quick-eat";

/**
 * POST /api/cargo/:id/quick-eat — web parity for Cargo Quick Eat.
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
		const { groupId, session } = await requireActiveGroup(context, request);
		const user = session.user;

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const input = CargoQuickEatRequestSchema.parse(body);
		const flagContext = buildWebFlagContext(request, context.cloudflare.env, {
			user,
		});
		const principal = {
			userId: user.id,
			organizationId: groupId,
			surface: "web" as const,
			authMethod: "session" as const,
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		return await quickEatFromCargo(
			context.cloudflare.env,
			groupId,
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
				source: "web",
			},
		);
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
