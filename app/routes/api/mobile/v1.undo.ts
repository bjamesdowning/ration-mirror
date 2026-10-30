import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	NutritionUndoUnavailableError,
	undoIntake,
} from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { UndoActionSchema } from "~/lib/schemas/mobile/undo";
import type { Route } from "./+types/v1.undo";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
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
		const { token } = UndoActionSchema.parse(body);
		const principal = {
			userId,
			organizationId,
			surface: "mobile" as const,
			authMethod: "mobile_bearer",
			scopes: ["nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};
		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{
				user: { id: userId },
			},
		);
		try {
			const result = await undoIntake(
				context.cloudflare.env,
				principal,
				flagContext,
				token,
			);
			return { success: true, kind: "manifest_intake", ...result };
		} catch (error) {
			if (
				error instanceof NutritionUndoUnavailableError &&
				error.fallbackAllowed
			) {
				throw data({ error: "Undo expired or unavailable" }, { status: 410 });
			}
			throw error;
		}
	} catch (e) {
		return handleApiError(e);
	}
}
