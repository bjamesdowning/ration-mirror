import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(),
}));

import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { resolveNutritionCapabilities } from "../feature-policy.server";

describe("resolveNutritionCapabilities", () => {
	it("gates children on engine and server eligibility", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(async (_env, key) => {
			return (
				key === "nutrition-engine" ||
				key === "nutrition-manifest" ||
				key === "nutrition-cook-log-split" ||
				key === "nutrition-goals" ||
				key === "nutrition-ai-estimate" ||
				key === "nutrition-async-recompute"
			);
		});

		const caps = await resolveNutritionCapabilities({} as Env, {}, {});
		expect(caps).toEqual({
			engine: true,
			manifest: true,
			cookLogSplit: true,
			goals: true,
			aiEstimate: false,
			asyncRecompute: false,
			crossOrgDiary: false,
		});

		const withEligibility = await resolveNutritionCapabilities(
			{} as Env,
			{},
			{
				serverEligibleAi: true,
				queueConfigured: true,
			},
		);
		expect(withEligibility.aiEstimate).toBe(true);
		expect(withEligibility.asyncRecompute).toBe(true);
	});

	it("enables crossOrgDiary when diary flag and manifest parent are on", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(async (_env, key) => {
			return (
				key === "nutrition-engine" ||
				key === "nutrition-manifest" ||
				key === "nutrition-cross-org-diary"
			);
		});
		const caps = await resolveNutritionCapabilities({} as Env, {});
		expect(caps.crossOrgDiary).toBe(true);
	});

	it("disables dependents when engine is off", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(async (_env, key) => {
			return key !== "nutrition-engine";
		});
		const caps = await resolveNutritionCapabilities(
			{} as Env,
			{},
			{ serverEligibleAi: true, queueConfigured: true },
		);
		expect(caps.engine).toBe(false);
		expect(caps.manifest).toBe(false);
		expect(caps.cookLogSplit).toBe(false);
		expect(caps.aiEstimate).toBe(false);
		expect(caps.asyncRecompute).toBe(false);
		expect(caps.goals).toBe(true);
	});
});
