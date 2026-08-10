import { describe, expect, it } from "vitest";
import { resolveCargoNutritionFlagContext } from "~/lib/cargo.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";

describe("resolveCargoNutritionFlagContext", () => {
	it("prefers passed flagContext over system fallback", () => {
		const flagContext: FlagshipEvaluationContext = {
			clientPlatform: "web",
			environment: "production",
			userId: "from-request",
			clientVersion: "1.0.0",
		};
		expect(
			resolveCargoNutritionFlagContext(
				{ RATION_ENV: "staging" },
				{ userId: "ignored", flagContext },
			),
		).toBe(flagContext);
	});

	it("falls back to system platform + userId when flagContext omitted", () => {
		expect(
			resolveCargoNutritionFlagContext(
				{ RATION_ENV: "production" },
				{ userId: "user-42" },
			),
		).toEqual({
			clientPlatform: "system",
			environment: "production",
			userId: "user-42",
		});
	});

	it("omits userId when neither flagContext nor userId provided", () => {
		expect(
			resolveCargoNutritionFlagContext({ RATION_ENV: "development" }),
		).toEqual({
			clientPlatform: "system",
			environment: "development",
		});
	});
});
