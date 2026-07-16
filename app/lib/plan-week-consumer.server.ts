/**
 * Plan-week queue consumer logic.
 * Runs Gemini to generate a weekly meal schedule from the org's meal library.
 * Stores status in D1 for polling.
 */
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { callGemini, gatewayFailureMessage } from "~/lib/ai-gateway.server";
import { parseAllergens } from "~/lib/allergens";
import { failAiJobWithRefund } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { getMealsForPicker } from "~/lib/manifest.server";
import {
	runIdempotentAiJob,
	updateQueueJobResult,
} from "~/lib/queue-job.server";
import {
	WeekPlanAIResponseSchema,
	type WeekPlanRequest,
} from "~/lib/schemas/week-plan";
import { buildWeekPlanPrompt, toPromptMeal } from "~/lib/week-plan-prompt";

export interface PlanWeekQueueMessage {
	requestId: string;
	planId: string;
	organizationId: string;
	userId: string;
	config: WeekPlanRequest;
	cost: number;
}

export interface PlanWeekJobResult {
	status: "completed" | "failed";
	organizationId: string;
	schedule?: Array<{
		date: string;
		slotType: string;
		mealId: string;
		mealName: string;
		notes?: string | null;
	}>;
	error?: string;
}

const PLAN_WEEK_CREDIT_REASON = "Weekly Meal Plan";

const PLAN_WEEK_GATEWAY_MESSAGES = {
	timeout: "Meal planning took too long. Try again.",
	rateLimited:
		"Meal planning is temporarily unavailable. Please try again later.",
	blocked: "Meal planning could not be completed due to content restrictions.",
	configMissing: "Meal planning configuration missing",
	error: "Meal planning failed",
} as const;

export async function runPlanWeekConsumerJob(
	env: Env,
	message: PlanWeekQueueMessage,
): Promise<void> {
	const { requestId } = message;
	await runIdempotentAiJob(env.DB, requestId, async () => {
		await executePlanWeekConsumerJob(env, message);
	});
}

async function executePlanWeekConsumerJob(
	env: Env,
	message: PlanWeekQueueMessage,
): Promise<void> {
	const { requestId, planId, organizationId, userId, config, cost } = message;

	const failJob = async (error: string) => {
		await failAiJobWithRefund(env, {
			requestId,
			organizationId,
			userId,
			cost,
			reason: PLAN_WEEK_CREDIT_REASON,
			writeStatus: async () => {
				return updateQueueJobResult(env.DB, requestId, "failed", {
					status: "failed",
					organizationId,
					error,
				});
			},
		});
	};

	try {
		const db = drizzle(env.DB, { schema });
		const groupId = organizationId;

		// Verify plan belongs to org
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
			await failJob("Meal plan not found");
			return;
		}

		const [allMeals, userRow] = await Promise.all([
			getMealsForPicker(env.DB, groupId),
			db
				.select({ settings: schema.user.settings })
				.from(schema.user)
				.where(eq(schema.user.id, userId))
				.limit(1)
				.then((rows) => rows[0] ?? null),
		]);

		const userAllergens = parseAllergens(
			(userRow?.settings as { allergens?: unknown } | null)?.allergens,
		);

		if (allMeals.length === 0) {
			await failJob(
				"No meals in your Galley. Add some recipes before planning your week.",
			);
			return;
		}

		const filteredMeals = config.tag
			? allMeals.filter((m) => m.tags.includes(config.tag as string))
			: allMeals;
		const mealsForPrompt = filteredMeals.length > 0 ? filteredMeals : allMeals;

		const weekDates: string[] = [];
		const startMs = new Date(`${config.startDate}T00:00:00`).getTime();
		for (let i = 0; i < config.days; i++) {
			const d = new Date(startMs + i * 86_400_000);
			const yyyy = d.getFullYear();
			const mm = String(d.getMonth() + 1).padStart(2, "0");
			const dd = String(d.getDate()).padStart(2, "0");
			weekDates.push(`${yyyy}-${mm}-${dd}`);
		}

		const validMealIds = new Set(mealsForPrompt.map((m) => m.id));

		const { systemPrompt, userPrompt } = buildWeekPlanPrompt({
			meals: mealsForPrompt.map(toPromptMeal),
			config,
			weekDates,
			userAllergens,
		});

		const gatewayResult = await callGemini(env, {
			feature: "plan_week",
			parts: [{ text: systemPrompt }, { text: userPrompt }],
			metadata: { organizationId, userId },
		});

		if (!gatewayResult.ok) {
			await failJob(
				gatewayFailureMessage(gatewayResult.reason, PLAN_WEEK_GATEWAY_MESSAGES),
			);
			return;
		}

		const modelText = gatewayResult.text;

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
			await failJob("AI planning failed due to a formatting error. Try again.");
			return;
		}

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
			await failJob(
				"Could not generate a valid schedule from your meal library. Try adjusting your preferences.",
			);
			return;
		}

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

		await updateQueueJobResult(env.DB, requestId, "completed", {
			status: "completed",
			organizationId,
			schedule: enrichedSchedule,
		});
	} catch (err) {
		log.error("Plan week consumer job failed", err);
		await failJob(err instanceof Error ? err.message : "Meal planning failed");
	}
}
