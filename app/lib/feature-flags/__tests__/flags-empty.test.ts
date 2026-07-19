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
			aiScanReceipt: false,
			aiDockFromReceipt: false,
			aiGenerateMeal: false,
			aiPlanWeek: false,
		});
	});
});
