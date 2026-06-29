import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	mapRecipeImportSubmitError,
	submitRecipeImport,
} from "~/lib/recipe-import-submit.server";
import { RecipeImportRequestSchema } from "~/lib/schemas/recipe-import";
import type { Route } from "./+types/meals.import";

export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"recipe_import",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		return data(
			{
				error: "Too many import requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return data({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsedRequest = RecipeImportRequestSchema.safeParse(body);
	if (!parsedRequest.success) {
		const firstIssue = parsedRequest.error.issues[0];
		return data(
			{ error: firstIssue?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}

	try {
		const result = await submitRecipeImport(context.cloudflare.env, {
			userId: user.id,
			organizationId: groupId,
			url: parsedRequest.data.url,
		});

		if ("code" in result && result.code === "DUPLICATE_URL") {
			return data(
				{
					success: false,
					code: result.code,
					existingMealId: result.existingMealId,
					existingMealName: result.existingMealName,
					error: result.error,
				},
				{ status: 409 },
			);
		}

		return data(result);
	} catch (error) {
		mapRecipeImportSubmitError(error);
		return handleApiError(error);
	}
}
