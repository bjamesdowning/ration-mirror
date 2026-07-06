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
	},
	getClientFlagKey: (_flag: string, entry: { clientKey?: string }) =>
		entry.clientKey ?? _flag,
	isValidFlagKey: () => true,
	assertRegistryDefaults: () => {},
}));

vi.mock("../registry", () => mockRegistry);

import { getClientSafeFlags, isFeatureEnabled } from "../flags.server";

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
});
