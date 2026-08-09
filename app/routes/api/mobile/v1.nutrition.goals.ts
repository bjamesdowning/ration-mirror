import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/flags.server";
import { getTodayISO } from "~/lib/manifest-dates";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { serializeNutritionGoal } from "~/lib/nutrition/dto.server";
import {
	clearGoal,
	getGoal,
	resolveHttpOperationKey,
	setGoal,
} from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	NutritionGoalAsOfQuerySchema,
	NutritionGoalUpsertSchema,
} from "~/lib/schemas/nutrition";
import type { Route } from "./+types/v1.nutrition.goals";

/**
 * GET /api/mobile/v1/nutrition/goals?asOf=YYYY-MM-DD
 * `asOf` uses the client's local calendar day so midnight UTC skew does not
 * hide a goal saved with the device's today.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		const principal = {
			userId,
			organizationId,
			surface: "mobile" as const,
			authMethod: "mobile_bearer",
			scopes: ["nutrition:read"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		const url = new URL(request.url);
		const asOfParsed = NutritionGoalAsOfQuerySchema.safeParse({
			asOf: url.searchParams.get("asOf") ?? undefined,
		});
		if (!asOfParsed.success) {
			throw data(
				{ error: "Invalid request", details: asOfParsed.error.flatten() },
				{ status: 400 },
			);
		}
		const asOf = asOfParsed.data.asOf ?? getTodayISO();
		const goal = await getGoal(env, principal, flagContext, asOf);
		return { goal: goal ? serializeNutritionGoal(goal) : null };
	} catch (e) {
		return handleApiError(e);
	}
}

/**
 * POST/PATCH /api/mobile/v1/nutrition/goals — upsert.
 * DELETE — clear.
 */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		const principal = {
			userId,
			organizationId,
			surface: "mobile" as const,
			authMethod: "mobile_bearer",
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		if (request.method === "DELETE") {
			const url = new URL(request.url);
			const operationKey = resolveHttpOperationKey(
				request.headers,
				url.searchParams.get("operationKey"),
			);
			const asOfParsed = NutritionGoalAsOfQuerySchema.safeParse({
				asOf: url.searchParams.get("asOf") ?? undefined,
			});
			if (!asOfParsed.success) {
				throw data(
					{ error: "Invalid request", details: asOfParsed.error.flatten() },
					{ status: 400 },
				);
			}
			return clearGoal(env, principal, flagContext, {
				operationKey,
				asOfDate: asOfParsed.data.asOf ?? getTodayISO(),
			});
		}

		if (request.method !== "POST" && request.method !== "PATCH") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const json = await request.json();
		const parsed = NutritionGoalUpsertSchema.safeParse(json);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const result = await setGoal(env, principal, flagContext, {
			operationKey: resolveHttpOperationKey(
				request.headers,
				parsed.data.operationKey,
			),
			dailyEnergyKcal: parsed.data.dailyEnergyKcal,
			proteinG: parsed.data.proteinG,
			carbsG: parsed.data.carbsG,
			fatG: parsed.data.fatG,
			fiberG: parsed.data.fiberG ?? null,
			effectiveFrom: parsed.data.effectiveFrom,
		});

		return {
			goal: serializeNutritionGoal(result.goal),
			operationId: result.operationId,
			replayed: result.replayed,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
