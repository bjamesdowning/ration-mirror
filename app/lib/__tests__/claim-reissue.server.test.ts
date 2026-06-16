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
import {
	ClaimReissueError,
	reissueClaimToken,
} from "../agent/claim-reissue.server";

describe("reissueClaimToken", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSet.mockReturnValue({ where: mockWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
	});

	const apiKeyRecord = {
		id: "key-1",
		organizationId: "org-1",
		userId: "user-1",
		keyHash: "hash",
		keyPrefix: "rtn_live_abcdefgh",
		name: "Agent",
		scopes: "[]",
		lastUsedAt: null,
		createdAt: new Date(),
	};

	it("issues new claim token for pending_claim registration", async () => {
		const now = new Date("2026-06-01T00:00:00Z");
		const env = { DB: {} as D1Database } as Cloudflare.Env;
		const request = new Request(
			"https://ration.mayutic.com/api/agent/auth/claim/reissue",
		);
		mockFindFirst.mockResolvedValue({
			id: "reg-1",
			status: "pending_claim",
			apiKeyId: "key-1",
		});

		const result = await reissueClaimToken(env, apiKeyRecord, request, now);

		expect(result.claimToken).toHaveLength(32);
		expect(result.claimUrl).toContain("/connect/claim?token=");
		expect(result.claimTokenExpiresAt.getTime()).toBe(
			now.getTime() + CLAIM_TOKEN_SLIDE_MS,
		);
		expect(mockUpdate).toHaveBeenCalled();
	});

	it("throws when registration is not pending_claim", async () => {
		const env = { DB: {} as D1Database } as Cloudflare.Env;
		const request = new Request("https://ration.mayutic.com/");
		mockFindFirst.mockResolvedValue({
			id: "reg-1",
			status: "claimed",
			apiKeyId: "key-1",
		});

		await expect(
			reissueClaimToken(env, apiKeyRecord, request),
		).rejects.toBeInstanceOf(ClaimReissueError);
	});

	it("throws when no registration matches API key org", async () => {
		const env = { DB: {} as D1Database } as Cloudflare.Env;
		const request = new Request("https://ration.mayutic.com/");
		mockFindFirst.mockResolvedValue(null);

		await expect(
			reissueClaimToken(env, apiKeyRecord, request),
		).rejects.toMatchObject({ code: "not_pending" });
	});
});
