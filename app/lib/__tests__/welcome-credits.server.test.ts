import { beforeEach, describe, expect, it, vi } from "vitest";

const { addCreditsMock, findFirstMock, updateWhereMock } = vi.hoisted(() => ({
	addCreditsMock: vi.fn(),
	findFirstMock: vi.fn(),
	updateWhereMock: vi.fn(),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			user: { findFirst: findFirstMock },
		},
		update: () => ({
			set: () => ({
				where: updateWhereMock,
			}),
		}),
	}),
}));

vi.mock("~/lib/ledger.server", () => ({
	addCredits: addCreditsMock,
}));

vi.mock("~/lib/logging.server", () => ({
	log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
	redactId: (id: string) => id,
}));

import { grantWelcomeCreditsIfEligible } from "~/lib/welcome-credits.server";

describe("grantWelcomeCreditsIfEligible", () => {
	beforeEach(() => {
		addCreditsMock.mockReset();
		findFirstMock.mockReset();
		updateWhereMock.mockReset();
		updateWhereMock.mockResolvedValue(undefined);
		addCreditsMock.mockResolvedValue(undefined);
	});

	it("grants credits for a human user", async () => {
		findFirstMock.mockResolvedValue({
			welcomeVoucherRedeemed: false,
			email: "human@example.com",
		});

		const granted = await grantWelcomeCreditsIfEligible({} as Env, {
			userId: "user-1",
			organizationId: "org-1",
			email: "human@example.com",
		});

		expect(granted).toBe(true);
		expect(addCreditsMock).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			"user-1",
			12,
			"Welcome credits",
			{ idempotencyKey: "welcome12:user-1" },
		);
		expect(updateWhereMock).toHaveBeenCalled();
	});

	it("skips agent stub emails", async () => {
		const granted = await grantWelcomeCreditsIfEligible({} as Env, {
			userId: "agent-1",
			organizationId: "org-1",
			email: "agent+agent-1@agents.ration.mayutic.com",
		});
		expect(granted).toBe(false);
		expect(addCreditsMock).not.toHaveBeenCalled();
	});

	it("skips when already redeemed", async () => {
		findFirstMock.mockResolvedValue({
			welcomeVoucherRedeemed: true,
			email: "human@example.com",
		});
		const granted = await grantWelcomeCreditsIfEligible({} as Env, {
			userId: "user-1",
			organizationId: "org-1",
			email: "human@example.com",
		});
		expect(granted).toBe(false);
		expect(addCreditsMock).not.toHaveBeenCalled();
	});
});
