import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileAIConsent } from "~/lib/mobile/ai-consent.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	mapRecipeImportSubmitError,
	submitRecipeImport,
} from "~/lib/recipe-import-submit.server";
import { RecipeImportRequestSchema } from "~/lib/schemas/recipe-import";
import type { Route } from "./+types/v1.meals.import";

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
			"recipe_import",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many import requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const parsedRequest = RecipeImportRequestSchema.safeParse(body);
		if (!parsedRequest.success) {
			throw data(
				{
					error: parsedRequest.error.issues[0]?.message ?? "Invalid request",
				},
				{ status: 400 },
			);
		}

		const result = await submitRecipeImport(env, {
			userId,
			organizationId,
			url: parsedRequest.data.url,
		});

		if ("code" in result && result.code === "DUPLICATE_URL") {
			throw data(result, { status: 409 });
		}

		return result;
	} catch (e) {
		mapRecipeImportSubmitError(e);
		return handleApiError(e);
	}
}
