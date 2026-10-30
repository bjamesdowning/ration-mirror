import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

const mockRegistry = vi.hoisted(() => ({
	FLAG_REGISTRY: {
		"smoke-test": {
			defaultEnabled: false,
			description: "unit test only",
			clientVisible: true,
			clientKey: "smokeTest",
		},
		"ios-shipped": {
			defaultEnabled: false,
			description: "unit test only",
			iosAlwaysOn: true,
		},
	},
	getClientFlagKey: (_flag: string, entry: { clientKey?: string }) =>
		entry.clientKey ?? _flag,
	isValidFlagKey: () => true,
	assertRegistryDefaults: () => {},
}));

vi.mock("../registry", () => mockRegistry);

import {
	buildWebFlagContext,
	type FlagshipEvaluationContext,
} from "../context.server";
import {
	applyClientFlagDependencies,
	getClientSafeFlags,
	isFeatureEnabled,
} from "../flags.server";

describe("getClientSafeFlags", () => {
	it("evaluates clientVisible flags once per key", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(true);
		const env = {
			...createMockEnv(),
			FLAGS: { getBooleanValue } as unknown as Flagship,
		};
		const result = await getClientSafeFlags(env, { userId: "u1" });
		expect(result).toEqual({ smokeTest: true });
		expect(getBooleanValue).toHaveBeenCalledTimes(1);
	});

	it("forwards web document context (clientPlatform web) to Flagship", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(true);
		const env = {
			...createMockEnv(),
			FLAGS: { getBooleanValue } as unknown as Flagship,
		};
		const request = new Request("https://ration.mayutic.com/");
		const context = buildWebFlagContext(request, { RATION_ENV: "production" });
		await getClientSafeFlags(env, context);
		expect(getBooleanValue).toHaveBeenCalledWith(
			"smoke-test",
			false,
			expect.objectContaining({
				clientPlatform: "web",
				environment: "production",
			}),
		);
	});

	it("projects nutrition children as effective capabilities", () => {
		expect(
			applyClientFlagDependencies({
				nutritionEngine: false,
				nutritionManifest: true,
				nutritionCookLogSplit: true,
				cargoQuickEat: true,
				nutritionAiEstimate: true,
				nutritionIntakeNotes: true,
				nutritionGoals: true,
				nutritionCrossOrgDiary: true,
			}),
		).toEqual({
			nutritionEngine: false,
			nutritionManifest: false,
			nutritionCookLogSplit: false,
			cargoQuickEat: false,
			nutritionAiEstimate: false,
			nutritionIntakeNotes: false,
			nutritionGoals: true,
			nutritionCrossOrgDiary: false,
		});

		expect(
			applyClientFlagDependencies({
				nutritionEngine: true,
				nutritionManifest: true,
				nutritionCookLogSplit: true,
				cargoQuickEat: true,
				nutritionIntakeNotes: true,
				nutritionCrossOrgDiary: true,
			}),
		).toMatchObject({
			nutritionManifest: true,
			nutritionCookLogSplit: true,
			cargoQuickEat: true,
			nutritionIntakeNotes: true,
			nutritionCrossOrgDiary: true,
		});
	});
});

describe("isFeatureEnabled", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("respects FEATURE_FLAG_OVERRIDES over binding", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(true);
		const env = {
			...createMockEnv(),
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "smoke-test": false }),
			FLAGS: { getBooleanValue } as unknown as Flagship,
		};
		const enabled = await isFeatureEnabled(env, "smoke-test" as never, {
			userId: "u1",
		});
		expect(enabled).toBe(false);
		expect(getBooleanValue).not.toHaveBeenCalled();
	});

	it("calls binding with context when no override", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(true);
		const env = {
			...createMockEnv(),
			FLAGS: { getBooleanValue } as unknown as Flagship,
		};
		const context = { userId: "u1", country: "GB" };
		const enabled = await isFeatureEnabled(env, "smoke-test" as never, context);
		expect(enabled).toBe(true);
		expect(getBooleanValue).toHaveBeenCalledWith("smoke-test", false, context);
	});

	it("uses registry default when binding is absent", async () => {
		const { FLAGS: _flags, ...envWithoutFlags } = createMockEnv();
		const enabled = await isFeatureEnabled(
			envWithoutFlags as ReturnType<typeof createMockEnv>,
			"smoke-test" as never,
			{},
		);
		expect(enabled).toBe(false);
	});

	it("falls back to registry default when binding throws locally", async () => {
		const getBooleanValue = vi
			.fn()
			.mockRejectedValue(new Error("Binding FLAGS needs to be run remotely"));
		const env = {
			...createMockEnv(),
			FLAGS: { getBooleanValue } as unknown as Flagship,
		};
		const enabled = await isFeatureEnabled(env, "smoke-test" as never, {
			userId: "u1",
		});
		expect(enabled).toBe(false);
	});

	describe("iosAlwaysOn", () => {
		function envWithFlagshipOff() {
			const getBooleanValue = vi.fn().mockResolvedValue(false);
			return {
				env: {
					...createMockEnv(),
					FLAGS: { getBooleanValue } as unknown as Flagship,
				},
				getBooleanValue,
			};
		}

		it("is on for iOS at the feature floor without asking Flagship", async () => {
			const { env, getBooleanValue } = envWithFlagshipOff();
			for (const clientVersion of ["1.5.0", "1.5.11", "2.0"]) {
				const enabled = await isFeatureEnabled(env, "ios-shipped" as never, {
					clientPlatform: "ios",
					clientVersion,
				});
				expect(enabled).toBe(true);
			}
			expect(getBooleanValue).not.toHaveBeenCalled();
		});

		it("leaves older iOS, web, MCP, and unknown versions to Flagship", async () => {
			const { env, getBooleanValue } = envWithFlagshipOff();
			const contexts: FlagshipEvaluationContext[] = [
				{ clientPlatform: "ios", clientVersion: "1.4.31" },
				{ clientPlatform: "ios", clientVersion: "unknown" },
				{ clientPlatform: "ios" },
				{ clientPlatform: "web", clientVersion: "1.9.30" },
				{ clientPlatform: "mcp", clientVersion: "1.9.30" },
			];
			for (const context of contexts) {
				expect(
					await isFeatureEnabled(env, "ios-shipped" as never, context),
				).toBe(false);
			}
			expect(getBooleanValue).toHaveBeenCalledTimes(contexts.length);
		});

		it("still honors an emergency override on iOS", async () => {
			const env = {
				...createMockEnv(),
				FEATURE_FLAG_OVERRIDES: JSON.stringify({ "ios-shipped": false }),
			};
			const enabled = await isFeatureEnabled(env, "ios-shipped" as never, {
				clientPlatform: "ios",
				clientVersion: "1.5.11",
			});
			expect(enabled).toBe(false);
		});

		it("does not turn on flags without the marker", async () => {
			const { env } = envWithFlagshipOff();
			const enabled = await isFeatureEnabled(env, "smoke-test" as never, {
				clientPlatform: "ios",
				clientVersion: "1.5.11",
			});
			expect(enabled).toBe(false);
		});
	});
});
