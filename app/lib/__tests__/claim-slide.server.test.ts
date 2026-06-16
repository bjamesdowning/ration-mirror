import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const mockFindFirst = vi.fn();
const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn();
const mockUpdate = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			agentRegistration: { findFirst: mockFindFirst },
		},
		update: mockUpdate,
	})),
}));

import { CLAIM_TOKEN_SLIDE_MS } from "../agent/claim.constants";
import { slideClaimTokenExpiry } from "../agent/claim-slide.server";

describe("slideClaimTokenExpiry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSet.mockReturnValue({ where: mockWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
	});

	it("extends claimTokenExpiresAt for pending_claim registration", async () => {
		const now = new Date("2026-06-01T00:00:00Z");
		mockFindFirst.mockResolvedValue({ id: "reg-1" });

		await slideClaimTokenExpiry({} as D1Database, "org-1", now);

		expect(mockUpdate).toHaveBeenCalled();
		expect(mockSet).toHaveBeenCalledWith({
			claimTokenExpiresAt: new Date(now.getTime() + CLAIM_TOKEN_SLIDE_MS),
		});
		expect(mockWhere).toHaveBeenCalled();
	});

	it("no-ops when no pending registration exists", async () => {
		mockFindFirst.mockResolvedValue(null);

		await slideClaimTokenExpiry({} as D1Database, "org-1");

		expect(mockUpdate).not.toHaveBeenCalled();
	});
});
