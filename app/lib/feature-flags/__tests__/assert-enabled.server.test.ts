import { describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";
import {
	assertFeatureEnabled,
	FEATURE_DISABLED_CODE,
} from "../assert-enabled.server";

describe("assertFeatureEnabled", () => {
	it("resolves when the flag is enabled", async () => {
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(true),
			}),
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "ai-scan-receipt": true }),
		};
		await expect(
			assertFeatureEnabled(env, "ai-scan-receipt", { userId: "u1" }),
		).resolves.toBeUndefined();
	});

	it("throws 403 FEATURE_DISABLED when the flag is off", async () => {
		const env = createMockEnv();
		try {
			await assertFeatureEnabled(env, "ai-scan-receipt", { userId: "u1" });
			expect.unreachable("expected assertFeatureEnabled to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: {
					code: FEATURE_DISABLED_CODE,
					error: "This feature is temporarily unavailable.",
				},
				init: { status: 403 },
			});
		}
	});
});
