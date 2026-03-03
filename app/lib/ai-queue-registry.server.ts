/**
 * Central registry of AI queue consumers.
 * Add new queues by: 1) create consumer module, 2) add entry here.
 * workers/app.ts uses this for dispatch — no manual switch required.
 */
import { runImportUrlConsumerJob } from "~/lib/import-url-consumer.server";
import { runMealGenerateConsumerJob } from "~/lib/meal-generate-consumer.server";
import { runPlanWeekConsumerJob } from "~/lib/plan-week-consumer.server";
import { runScanConsumerJob } from "~/lib/scan-consumer.server";

type QueueHandler = (env: Env, body: unknown) => Promise<void>;

export const AI_QUEUE_HANDLERS: Record<string, QueueHandler> = {
	"ration-scan": runScanConsumerJob as QueueHandler,
	"ration-meal-generate": runMealGenerateConsumerJob as QueueHandler,
	"ration-plan-week": runPlanWeekConsumerJob as QueueHandler,
	"ration-import-url": runImportUrlConsumerJob as QueueHandler,
};
