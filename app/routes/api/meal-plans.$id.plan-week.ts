import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { extractModelText } from "~/lib/ai.server";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { getMealsForPicker } from "~/lib/manifest.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	WeekPlanAIResponseSchema,
	WeekPlanRequestSchema,
} from "~/lib/schemas/week-plan";
import { buildWeekPlanPrompt, toPromptMeal } from "~/lib/week-plan-prompt";
import type { Route } from "./+types/meal-plans.$id.plan-week";

const PLAN_WEEK_MODEL = "gemini-3-flash-preview";

/**
 * POST /api/meal-plans/:id/plan-week
 *
 * AI-powered weekly meal scheduler. Uses the org's existing meal library to
 * generate a schedule for the requested days and slots via Gemini.
 *
 * Security:
 *   - requireActiveGroup enforces auth + RLS
 *   - plan_week rate limit: 5 req/min per user
 *   - 3-credit gate via withCreditGate (auto-refunds on error)
 *   - All mealIds in AI response are validated against the org whitelist
 *   - Plan ownership verified before returning data
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const planId = params.id;
	if (!planId) {
		throw data({ error: "Plan ID required" }, { status: 400 });
	}

	// Rate limiting — tight budget for expensive AI call
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"plan_week",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many planning requests. Please try again later." },
			{
				status: 429,
				headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) },
			},
		);
	}

	// Parse and validate request body
	let requestBody: unknown;
	try {
		requestBody = await request.json();
	} catch {
		throw data({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parseResult = WeekPlanRequestSchema.safeParse(requestBody);
	if (!parseResult.success) {
		throw data(
			{ error: parseResult.error.issues[0]?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}
	const config = parseResult.data;

	const db = drizzle(context.cloudflare.env.DB, { schema });

	// Verify plan belongs to this org
	const [planRow] = await db
		.select({ id: schema.mealPlan.id })
		.from(schema.mealPlan)
		.where(
			and(
				eq(schema.mealPlan.id, planId),
				eq(schema.mealPlan.organizationId, groupId),
				eq(schema.mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!planRow) {
		throw data({ error: "Meal plan not found" }, { status: 404 });
	}

	// Fetch org meals (already RLS-scoped to groupId by getMealsForPicker)
	const allMeals = await getMealsForPicker(context.cloudflare.env.DB, groupId);

	if (allMeals.length === 0) {
		throw data(
			{
				error:
					"No meals in your Galley. Add some recipes before planning your week.",
			},
			{ status: 400 },
		);
	}

	// Apply tag filter if requested
	const filteredMeals = config.tag
		? allMeals.filter((m) => m.tags.includes(config.tag as string))
		: allMeals;

	// If tag filter empties the list, fall back to all meals (better than an error)
	const mealsForPrompt = filteredMeals.length > 0 ? filteredMeals : allMeals;

	// Build week date array for the requested number of days
	const weekDates: string[] = [];
	const startMs = new Date(`${config.startDate}T00:00:00`).getTime();
	for (let i = 0; i < config.days; i++) {
		const d = new Date(startMs + i * 86_400_000);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		weekDates.push(`${yyyy}-${mm}-${dd}`);
	}

	// Build a Set of valid mealIds for post-generation RLS check
	const validMealIds = new Set(mealsForPrompt.map((m) => m.id));

	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId: user.id,
				cost: AI_COSTS.MEAL_PLAN_WEEKLY,
				reason: "Weekly Meal Plan",
			},
			async () => {
				const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } =
					context.cloudflare.env;

				if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
					throw data(
						{ error: "Meal planning configuration missing" },
						{ status: 500 },
					);
				}

				const { systemPrompt, userPrompt } = buildWeekPlanPrompt({
					meals: mealsForPrompt.map(toPromptMeal),
					config,
					weekDates,
				});

				const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio`;

				const response = await fetch(
					`${gatewayUrl}/v1beta/models/${PLAN_WEEK_MODEL}:generateContent`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"cf-aig-authorization": `Bearer ${CF_AIG_TOKEN}`,
						},
						body: JSON.stringify({
							contents: [
								{
									parts: [{ text: systemPrompt }, { text: userPrompt }],
								},
							],
						}),
					},
				);

				if (!response.ok) {
					await response.text();
					const isTimeout =
						response.status === 408 ||
						response.status === 504 ||
						response.status === 524;
					throw data(
						{
							error: isTimeout
								? "Meal planning took too long. Try again."
								: "Meal planning failed",
						},
						{ status: isTimeout ? 422 : 500 },
					);
				}

				const payload = (await response.json()) as unknown;
				const modelText = extractModelText(payload);
				if (!modelText) {
					throw data({ error: "Meal planning failed" }, { status: 500 });
				}

				// Parse and validate AI response
				let aiResponse: {
					schedule: Array<{
						date: string;
						slotType: string;
						mealId: string;
						notes?: string | null;
					}>;
				};
				try {
					const cleanedText = modelText
						.replace(/^```(?:json)?\s*\n?/i, "")
						.replace(/\n?```\s*$/i, "")
						.trim();
					const parsed = JSON.parse(cleanedText);
					const parseResult = WeekPlanAIResponseSchema.safeParse(parsed);
					if (!parseResult.success) {
						throw new Error("Invalid AI response structure");
					}
					aiResponse = parseResult.data;
				} catch (e) {
					log.error("Failed to parse AI week plan response", e);
					throw data(
						{
							error: "AI planning failed due to a formatting error. Try again.",
						},
						{ status: 500 },
					);
				}

				// RLS guard: reject any mealId the AI hallucinated outside our whitelist
				const schedule = aiResponse.schedule.filter((entry) => {
					const valid = validMealIds.has(entry.mealId);
					if (!valid) {
						log.warn("AI returned unknown mealId — filtered out", {
							mealId: entry.mealId,
						});
					}
					return valid;
				});

				if (schedule.length === 0) {
					throw data(
						{
							error:
								"Could not generate a valid schedule from your meal library. Try adjusting your preferences.",
						},
						{ status: 422 },
					);
				}

				// Fetch meal names for the preview (client needs names, not just IDs)
				const scheduledMealIds = [...new Set(schedule.map((e) => e.mealId))];
				const mealRows = await db
					.select({ id: schema.meal.id, name: schema.meal.name })
					.from(schema.meal)
					.where(
						and(
							eq(schema.meal.organizationId, groupId),
							inArray(schema.meal.id, scheduledMealIds),
						),
					)
					.limit(50);

				const mealNameById = new Map(mealRows.map((m) => [m.id, m.name]));

				const enrichedSchedule = schedule.map((entry) => ({
					...entry,
					mealName: mealNameById.get(entry.mealId) ?? "Unknown Meal",
				}));

				return { success: true, schedule: enrichedSchedule };
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

		if (error instanceof Response) {
			throw error;
		}

		log.error("Weekly meal planning failed", error);

		if (
			error &&
			typeof error === "object" &&
			"type" in error &&
			(error as { type: string }).type === "DataWithResponseInit"
		) {
			throw error as Response;
		}

		throw data({ error: "Internal planning error" }, { status: 500 });
	}
}
