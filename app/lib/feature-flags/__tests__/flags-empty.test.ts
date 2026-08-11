import { describe, expect, it } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { getClientSafeFlags } from "../flags.server";

describe("getClientSafeFlags", () => {
	it("returns client-safe defaults when binding is absent", async () => {
		const env = createMockEnv();
		const result = await getClientSafeFlags(env, { country: "US" });
		expect(result).toEqual({
			appleWebLogin: false,
			rationCopilot: false,
			aiImportUrl: false,
			aiImportWeb: false,
			aiImportSocial: false,
			aiImportPhoto: false,
			aiScanReceipt: false,
			aiDockFromReceipt: false,
			aiGenerateMeal: false,
			aiPlanWeek: false,
			appReviewLogin: false,
			nutritionEngine: false,
			nutritionAiEstimate: false,
			nutritionManifest: false,
			nutritionGoals: false,
			nutritionCookLogSplit: false,
			cargoQuickEat: false,
			nutritionIntakeNotes: false,
		});
	});
});
