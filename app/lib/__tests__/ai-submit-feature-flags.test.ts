import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";

vi.mock("../feature-flags/assert-enabled.server", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../feature-flags/assert-enabled.server")
		>();
	return {
		...actual,
		assertFeatureEnabled: vi.fn(actual.assertFeatureEnabled),
	};
});

import {
	assertFeatureEnabled,
	FEATURE_DISABLED_CODE,
} from "../feature-flags/assert-enabled.server";
import { submitMealGenerate } from "../meal-generate-submit.server";
import { submitPlanWeek } from "../plan-week-submit.server";
import { submitRecipeImport } from "../recipe-import-submit.server";
import { submitVisualScan } from "../scan-submit.server";

describe("AI submit feature flags", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("submitRecipeImport asserts ai-import-url before credit work", async () => {
		const send = vi.fn();
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(false),
			}),
			IMPORT_URL_QUEUE: { send },
		} as unknown as Cloudflare.Env;

		await expect(
			submitRecipeImport(env, {
				userId: "u1",
				organizationId: "o1",
				url: "https://example.com/recipe",
				flagContext: { userId: "u1" },
			}),
		).rejects.toMatchObject({
			type: "DataWithResponseInit",
			data: { code: FEATURE_DISABLED_CODE },
			init: { status: 403 },
		});
		expect(assertFeatureEnabled).toHaveBeenCalledWith(env, "ai-import-url", {
			userId: "u1",
		});
		expect(send).not.toHaveBeenCalled();
	});

	it("submitVisualScan asserts ai-scan-receipt before credit work", async () => {
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(false),
			}),
			SCAN_QUEUE: { send: vi.fn() },
		} as unknown as Cloudflare.Env;

		await expect(
			submitVisualScan(env, {
				imageFile: new File([new Uint8Array([1, 2, 3])], "x.jpg", {
					type: "image/jpeg",
				}),
				userId: "u1",
				organizationId: "o1",
				flagContext: { userId: "u1" },
			}),
		).rejects.toMatchObject({
			type: "DataWithResponseInit",
			data: { code: FEATURE_DISABLED_CODE },
			init: { status: 403 },
		});
		expect(assertFeatureEnabled).toHaveBeenCalledWith(env, "ai-scan-receipt", {
			userId: "u1",
		});
		expect(env.SCAN_QUEUE?.send).not.toHaveBeenCalled();
	});

	it("submitMealGenerate asserts ai-generate-meal before credit work", async () => {
		const send = vi.fn();
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(false),
			}),
			MEAL_GENERATE_QUEUE: { send },
		} as unknown as Cloudflare.Env;

		await expect(
			submitMealGenerate(env, {
				userId: "u1",
				organizationId: "o1",
				flagContext: { userId: "u1" },
			}),
		).rejects.toMatchObject({
			type: "DataWithResponseInit",
			data: { code: FEATURE_DISABLED_CODE },
			init: { status: 403 },
		});
		expect(send).not.toHaveBeenCalled();
	});

	it("submitPlanWeek asserts ai-plan-week before credit work", async () => {
		const send = vi.fn();
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(false),
			}),
			PLAN_WEEK_QUEUE: { send },
			DB: {
				prepare: vi.fn(() => ({
					bind: vi.fn().mockReturnThis(),
					all: vi.fn().mockResolvedValue({ results: [] }),
					first: vi.fn().mockResolvedValue(null),
					run: vi.fn().mockResolvedValue({ success: true }),
				})),
				batch: vi.fn(),
				exec: vi.fn(),
				withSession: vi.fn(),
			},
		} as unknown as Cloudflare.Env;

		await expect(
			submitPlanWeek(env, {
				userId: "u1",
				organizationId: "o1",
				planId: "p1",
				config: {
					days: 7,
					startDate: "2026-07-01",
					slots: ["dinner"],
					tag: undefined,
					dietaryNote: undefined,
					variety: "medium",
				},
				flagContext: { userId: "u1" },
			}),
		).rejects.toMatchObject({
			type: "DataWithResponseInit",
			data: { code: FEATURE_DISABLED_CODE },
			init: { status: 403 },
		});
		expect(send).not.toHaveBeenCalled();
	});
});
