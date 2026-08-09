import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { getTodayISO } from "~/lib/manifest-dates";
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
import type { Route } from "./+types/nutrition.goals";

/**
 * GET /api/nutrition/goals?asOf=YYYY-MM-DD — current effective goal.
 * Defaults to today (UTC) when asOf is omitted.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flagContext = buildWebFlagContext(request, env, { user });
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
		const goal = await getGoal(
			env,
			{
				userId: user.id,
				organizationId: groupId,
				surface: "web",
				authMethod: "session",
				scopes: ["nutrition:read"],
				requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
			},
			flagContext,
			asOf,
		);
		return { goal: goal ? serializeNutritionGoal(goal) : null };
	} catch (e) {
		return handleApiError(e);
	}
}

/**
 * POST/PATCH /api/nutrition/goals — upsert goal (requires active consent).
 * DELETE — clear open-ended goals.
 */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flagContext = buildWebFlagContext(request, env, { user });
		const principal = {
			userId: user.id,
			organizationId: groupId,
			surface: "web" as const,
			authMethod: "session",
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			user.id,
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
