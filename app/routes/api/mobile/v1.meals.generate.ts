import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import {
	mapMealGenerateSubmitError,
	submitMealGenerate,
} from "~/lib/meal-generate-submit.server";
import { requireMobileAIConsent } from "~/lib/mobile/ai-consent.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealGenerateRequestSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/v1.meals.generate";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;

		await requireMobileAIConsent(env, userId);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"generate_meal",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many generation requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const parsed = MealGenerateRequestSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: parsed.error.issues[0]?.message ?? "Invalid request" },
				{ status: 400 },
			);
		}

		return await submitMealGenerate(env, {
			userId,
			organizationId,
			customization: parsed.data.customization,
		});
	} catch (e) {
		mapMealGenerateSubmitError(e);
		return handleApiError(e);
	}
}
