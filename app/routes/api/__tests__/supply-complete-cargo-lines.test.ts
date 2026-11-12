import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: vi.fn(async () => ({
		groupId: "org-1",
		session: { user: { id: "user-1" } },
	})),
	getUserSettings: vi.fn(async () => null),
}));

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: vi.fn(async () => ({
		userId: "user-1",
		organizationId: "org-1",
	})),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: vi.fn(async () => ({ allowed: true })),
	};
});

vi.mock("~/lib/supply-list-access.server", () => ({
	resolveSupplyListTarget: vi.fn(async () => ({ id: "list-1" })),
	requireLegacyLiveListId: vi.fn(async () => undefined),
}));

vi.mock("~/lib/supply.server", () => ({
	completeSupplyList: vi.fn(async () => ({
		docked: 1,
		summary: undefined,
		cargoSelectionsCleared: 0,
		cargoSelectionsReduced: 0,
	})),
}));

const env = createMockEnv();
const listId = "33333333-3333-4333-8333-333333333333";

const flagsOn = {
	"nutrition-fast-log": true,
	"nutrition-fuel-page": true,
	"plan-fuel-actions": true,
};

const flagsOff = {
	"nutrition-fast-log": false,
	"nutrition-fuel-page": false,
	"plan-fuel-actions": false,
};

function headers(flags: Record<string, boolean>, client?: string) {
	return {
		"x-ration-test-flags": JSON.stringify(flags),
		...(client ? { "X-Ration-Client": client } : {}),
	};
}

describe("supply complete passes plan-fuel flag context", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function expectContext(
		load: () => Promise<void>,
		platform: "web" | "ios",
		on: boolean,
	) {
		const { completeSupplyList } = await import("~/lib/supply.server");
		await load();
		expect(completeSupplyList).toHaveBeenCalledWith(
			env,
			"org-1",
			listId,
			expect.objectContaining({
				userId: "user-1",
				flagContext: expect.objectContaining({
					clientPlatform: platform,
					"testFlag:nutrition-fast-log": on,
					"testFlag:nutrition-fuel-page": on,
					"testFlag:plan-fuel-actions": on,
				}),
			}),
		);
	}

	it("web complete passes a flag-off context", async () => {
		const { action } = await import("~/routes/api/supply-lists.$id.complete");
		await expectContext(
			async () => {
				await action({
					request: new Request(
						`http://localhost/api/supply-lists/${listId}/complete`,
						{ method: "POST", headers: headers(flagsOff) },
					),
					context: { cloudflare: { env } },
					params: { id: listId },
				} as never);
			},
			"web",
			false,
		);
	});

	it("web complete passes a flag-on context", async () => {
		const { action } = await import("~/routes/api/supply-lists.$id.complete");
		await expectContext(
			async () => {
				await action({
					request: new Request(
						`http://localhost/api/supply-lists/${listId}/complete`,
						{ method: "POST", headers: headers(flagsOn) },
					),
					context: { cloudflare: { env } },
					params: { id: listId },
				} as never);
			},
			"web",
			true,
		);
	});

	it("legacy mobile complete passes a flag-off context", async () => {
		const { action } = await import("~/routes/api/mobile/v1.supply.complete");
		await expectContext(
			async () => {
				await action({
					request: new Request(
						"http://localhost/api/mobile/v1/supply/complete",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...headers(flagsOff, "ios/1.6.16"),
							},
							body: JSON.stringify({ listId }),
						},
					),
					context: { cloudflare: { env } },
					params: {},
				} as never);
			},
			"ios",
			false,
		);
	});

	it("legacy mobile complete passes a flag-on context", async () => {
		const { action } = await import("~/routes/api/mobile/v1.supply.complete");
		await expectContext(
			async () => {
				await action({
					request: new Request(
						"http://localhost/api/mobile/v1/supply/complete",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...headers(flagsOn, "ios/1.6.16"),
							},
							body: JSON.stringify({ listId }),
						},
					),
					context: { cloudflare: { env } },
					params: {},
				} as never);
			},
			"ios",
			true,
		);
	});

	it("mobile list complete passes a flag-off context", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.supply.lists.$listId.complete"
		);
		await expectContext(
			async () => {
				await action({
					request: new Request(
						`http://localhost/api/mobile/v1/supply/lists/${listId}/complete`,
						{
							method: "POST",
							headers: headers(flagsOff, "ios/1.6.16"),
						},
					),
					context: { cloudflare: { env } },
					params: { listId },
				} as never);
			},
			"ios",
			false,
		);
	});

	it("mobile list complete passes a flag-on context", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.supply.lists.$listId.complete"
		);
		await expectContext(
			async () => {
				await action({
					request: new Request(
						`http://localhost/api/mobile/v1/supply/lists/${listId}/complete`,
						{
							method: "POST",
							headers: headers(flagsOn, "ios/1.6.16"),
						},
					),
					context: { cloudflare: { env } },
					params: { listId },
				} as never);
			},
			"ios",
			true,
		);
	});
});
