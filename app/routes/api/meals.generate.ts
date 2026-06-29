import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	mapMealGenerateSubmitError,
	submitMealGenerate,
} from "~/lib/meal-generate-submit.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealGenerateRequestSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.generate";

export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"generate_meal",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many generation requests. Please try again later.",
			},
			{ status: 429 },
		);
	}

	let customization: string | undefined;
	try {
		const contentType = request.headers.get("Content-Type");
		let body: unknown;
		if (contentType?.includes("application/json")) {
			body = await request.json();
		} else {
			const formData = await request.formData();
			body = Object.fromEntries(formData.entries());
		}
		const parsed = MealGenerateRequestSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: parsed.error.issues[0]?.message ?? "Invalid request" },
				{ status: 400 },
			);
		}
		customization = parsed.data.customization;
	} catch (e) {
		if (
			e instanceof Response ||
			(e &&
				typeof e === "object" &&
				"type" in e &&
				(e as { type: string }).type === "DataWithResponseInit")
		) {
			throw e;
		}
		customization = undefined;
	}

	try {
		return await submitMealGenerate(context.cloudflare.env, {
			userId: user.id,
			organizationId: groupId,
			customization,
		});
	} catch (error) {
		mapMealGenerateSubmitError(error);
		if (
			error instanceof Response ||
			(error &&
				typeof error === "object" &&
				"type" in error &&
				(error as { type: string }).type === "DataWithResponseInit")
		) {
			throw error;
		}
		throw handleApiError(error);
	}
}
