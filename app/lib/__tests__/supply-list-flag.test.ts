import { describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";
import { FEATURE_DISABLED_CODE } from "../feature-flags/assert-enabled.server";
import {
	assertSupplyMultiListsEnabled,
	isSupplyMultiListsEnabled,
} from "../supply-list-flag.server";

const context = { userId: "u1", clientPlatform: "web" as const };

describe("supply-multi-lists flag", () => {
	it("resolves when Flagship returns true", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(true);
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({ getBooleanValue }),
		};

		await expect(
			assertSupplyMultiListsEnabled(env, context),
		).resolves.toBeUndefined();
		await expect(isSupplyMultiListsEnabled(env, context)).resolves.toBe(true);
		expect(getBooleanValue).toHaveBeenCalledWith(
			"supply-multi-lists",
			false,
			expect.objectContaining({ userId: "u1" }),
		);
	});

	it("fails closed when Flagship returns false", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(false);
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({ getBooleanValue }),
		};

		await expect(isSupplyMultiListsEnabled(env, context)).resolves.toBe(false);
		try {
			await assertSupplyMultiListsEnabled(env, context);
			expect.unreachable("expected assertSupplyMultiListsEnabled to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: {
					code: FEATURE_DISABLED_CODE,
					error: "Supply list library is not available.",
				},
				init: { status: 403 },
			});
		}
	});
});
