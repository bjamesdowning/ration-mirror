import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: vi.fn(async () => ({
		groupId: "org-1",
		session: { user: { id: "user-1" } },
	})),
	getUserSettings: vi.fn(async () => null),
}));

vi.mock("~/lib/supply.server", () => ({
	createSupplyListFromSelectedMeals: vi.fn(async () => ({
		list: { id: "list-1", items: [] },
		summary: {
			addedItems: 0,
			newLines: 0,
			removedLines: 0,
			changedLines: 0,
			coveredByCargo: 0,
			skippedItems: 0,
			mealsProcessed: 0,
			totalIngredients: 0,
		},
	})),
	completeSupplyList: vi.fn(async () => ({ docked: 1 })),
	getSupplyList: vi.fn(),
	getActiveSnoozes: vi.fn(),
}));

vi.mock("~/lib/supply-list-access.server", () => ({
	resolveSupplyListTarget: vi.fn(async () => ({ id: "list-1" })),
}));

const env = createMockEnv();
const listId = "22222222-2222-4222-8222-222222222222";

function post(intent: string, flags: Record<string, boolean>) {
	const body = new FormData();
	body.set("intent", intent);
	if (intent === "dock-cargo") body.set("listId", listId);
	return new Request("http://localhost/hub/supply", {
		method: "POST",
		headers: { "x-ration-test-flags": JSON.stringify(flags) },
		body,
	});
}

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

describe("hub supply sync cargo plan lines", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function run(intent: string, flags: Record<string, boolean>) {
		const { action } = await import("~/routes/hub/supply");
		return action({
			request: post(intent, flags),
			context: { cloudflare: { env } },
			params: {},
		} as never);
	}

	it("omits cargo plan lines when the flag is off", async () => {
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		await run("update-list", flagsOff);
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			env,
			"org-1",
			undefined,
			expect.objectContaining({
				trigger: "dashboard_grocery_action_update_list",
			}),
			"metric",
			"user-1",
			false,
		);
	});

	it("includes cargo plan lines when the flag is on", async () => {
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		await run("update-list", flagsOn);
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			env,
			"org-1",
			undefined,
			expect.objectContaining({
				trigger: "dashboard_grocery_action_update_list",
			}),
			"metric",
			"user-1",
			true,
		);
	});

	it("passes the web flag context into a dock rebuild", async () => {
		const { completeSupplyList } = await import("~/lib/supply.server");
		await run("dock-cargo", flagsOn);
		expect(completeSupplyList).toHaveBeenCalledWith(
			env,
			"org-1",
			listId,
			expect.objectContaining({
				userId: "user-1",
				flagContext: expect.objectContaining({
					clientPlatform: "web",
					"testFlag:plan-fuel-actions": true,
					"testFlag:nutrition-fast-log": true,
					"testFlag:nutrition-fuel-page": true,
				}),
			}),
		);
	});
});
