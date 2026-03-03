import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealGenerateRequestSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.generate";

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Auth & Group Context
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	// 2. Rate Limiting
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

	// 3. Parse request body
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
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId: user.id,
				cost: AI_COSTS.MEAL_GENERATE,
				reason: "Meal Generation",
			},
			async () => {
				const env = context.cloudflare.env;
				const MEAL_GENERATE_QUEUE = env.MEAL_GENERATE_QUEUE;

				if (!MEAL_GENERATE_QUEUE) {
					throw data(
						{
							error:
								"Meal generation service unavailable. Please try again later.",
						},
						{ status: 503 },
					);
				}

				const requestId = crypto.randomUUID();

				await MEAL_GENERATE_QUEUE.send({
					requestId,
					organizationId: groupId,
					userId: user.id,
					customization,
					cost: AI_COSTS.MEAL_GENERATE,
				});

				// D1-backed pending (strong consistency for status polling)
				await insertQueueJobPending(
					env.DB,
					requestId,
					"meal_generate",
					groupId,
				);

				return { status: "queued", requestId };
			},
		);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					required: error.required,
					...(typeof error.current === "number"
						? { current: error.current }
						: {}),
				},
				{ status: 402 },
			);
		}
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
