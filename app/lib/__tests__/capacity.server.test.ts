import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIER_LIMITS } from "~/lib/tiers.server";
import { createMockEnv } from "~/test/helpers/mock-env";

const mockWhere = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: mockWhere,
			})),
		})),
	})),
}));

import {
	buildRecipientCapacityExceededPayload,
	checkCapacityWithTier,
} from "~/lib/capacity.server";

const env = createMockEnv();
const organizationId = "org-crew-1";

const crewTierInfo = {
	tier: "crew_member" as const,
	limits: TIER_LIMITS.crew_member,
	isExpired: false,
};

const freeTierInfo = {
	tier: "free" as const,
	limits: TIER_LIMITS.free,
	isExpired: false,
};

describe("checkCapacityWithTier", () => {
	beforeEach(() => {
		mockWhere.mockReset();
	});

	it("returns real cargo count for crew unlimited tier", async () => {
		mockWhere.mockResolvedValueOnce([{ count: 163 }]);

		const result = await checkCapacityWithTier(
			env,
			organizationId,
			"cargo",
			crewTierInfo,
			0,
		);

		expect(result).toEqual({
			allowed: true,
			current: 163,
			limit: -1,
			tier: "crew_member",
			isExpired: false,
			canAdd: Number.POSITIVE_INFINITY,
		});
	});

	it("returns real meals count for crew unlimited tier", async () => {
		mockWhere.mockResolvedValueOnce([{ count: 42 }]);

		const result = await checkCapacityWithTier(
			env,
			organizationId,
			"meals",
			crewTierInfo,
			0,
		);

		expect(result.current).toBe(42);
		expect(result.limit).toBe(-1);
		expect(result.allowed).toBe(true);
		expect(result.canAdd).toBe(Number.POSITIVE_INFINITY);
	});

	it("returns real supplyLists count for crew unlimited tier", async () => {
		mockWhere.mockResolvedValueOnce([{ count: 7 }]);

		const result = await checkCapacityWithTier(
			env,
			organizationId,
			"supplyLists",
			crewTierInfo,
			0,
		);

		expect(result.current).toBe(7);
		expect(result.limit).toBe(-1);
		expect(result.allowed).toBe(true);
		expect(result.canAdd).toBe(Number.POSITIVE_INFINITY);
	});

	it("returns correct canAdd for free tier below cap", async () => {
		mockWhere.mockResolvedValueOnce([{ count: 10 }]);

		const result = await checkCapacityWithTier(
			env,
			organizationId,
			"cargo",
			freeTierInfo,
			1,
		);

		expect(result).toEqual({
			allowed: true,
			current: 10,
			limit: 35,
			tier: "free",
			isExpired: false,
			canAdd: 25,
		});
	});

	it("returns allowed false when free tier is at cap", async () => {
		mockWhere.mockResolvedValueOnce([{ count: 35 }]);

		const result = await checkCapacityWithTier(
			env,
			organizationId,
			"cargo",
			freeTierInfo,
			1,
		);

		expect(result.allowed).toBe(false);
		expect(result.current).toBe(35);
		expect(result.canAdd).toBe(0);
	});
});

describe("buildRecipientCapacityExceededPayload", () => {
	it("returns recipient_capacity_exceeded with limit in message", () => {
		const payload = buildRecipientCapacityExceededPayload({
			allowed: false,
			current: 5,
			limit: 5,
			tier: "crew_member",
			canCreate: 0,
		});

		expect(payload.error).toBe("recipient_capacity_exceeded");
		expect(payload.limit).toBe(5);
		expect(payload.current).toBe(5);
		expect(payload.message).toContain("5");
	});
});
