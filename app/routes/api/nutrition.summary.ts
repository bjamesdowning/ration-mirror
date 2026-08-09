import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { serializeNutritionSummary } from "~/lib/nutrition/dto.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import { getSummary } from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionSummaryQuerySchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/nutrition.summary";

/**
 * GET /api/nutrition/summary?from=&to= — daily intake totals for the active org.
 * Gated by nutrition-goals or nutrition-manifest.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flagContext = buildWebFlagContext(request, env, { user });

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"nutrition_summary",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many nutrition summary requests. Please try again later.",
			);
		}

		const caps = await resolveNutritionCapabilities(env, flagContext);
		if (!caps.goals && !caps.manifest) {
			throw data(
				{
					error: "This feature is temporarily unavailable.",
					code: FEATURE_DISABLED_CODE,
				},
				{ status: 403 },
			);
		}

		const url = new URL(request.url);
		const parsed = NutritionSummaryQuerySchema.safeParse({
			from: url.searchParams.get("from"),
			to: url.searchParams.get("to"),
		});
		if (!parsed.success) {
			throw data(
				{ error: "Invalid query", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const summary = await getSummary(
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
			parsed.data.from,
			parsed.data.to,
		);
		return serializeNutritionSummary(summary);
	} catch (e) {
		return handleApiError(e);
	}
}
