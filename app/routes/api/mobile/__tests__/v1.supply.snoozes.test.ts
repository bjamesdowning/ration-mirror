import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getSupplyList = vi.fn();
const snoozeSupplyItem = vi.fn();
const getActiveSnoozes = vi.fn();
const unsnoozeSupplyItem = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: (...args: unknown[]) => getSupplyList(...args),
	snoozeSupplyItem: (...args: unknown[]) => snoozeSupplyItem(...args),
	getActiveSnoozes: (...args: unknown[]) => getActiveSnoozes(...args),
	unsnoozeSupplyItem: (...args: unknown[]) => unsnoozeSupplyItem(...args),
}));

function makeContext() {
	return { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;
}

describe("mobile supply snooze routes", () => {
	beforeEach(() => {
		for (const fn of [
			requireMobileActiveGroup,
			checkRateLimit,
			getSupplyList,
			snoozeSupplyItem,
			getActiveSnoozes,
			unsnoozeSupplyItem,
		]) {
			fn.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getSupplyList.mockResolvedValue({ id: "list_1", items: [] });
	});

	it("POST snooze on supply item", async () => {
		snoozeSupplyItem.mockResolvedValue({ snoozed: true });
		const { action } = await import("~/routes/api/mobile/v1.supply.items.$id");
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/supply/items/item_1",
				{
					method: "POST",
					body: JSON.stringify({ duration: "3d" }),
					headers: { "Content-Type": "application/json" },
				},
			),
			context: makeContext(),
			params: { id: "item_1" },
		} as never);
		expect(result).toEqual({ snoozed: true });
		expect(snoozeSupplyItem).toHaveBeenCalledWith(
			{},
			"org_1",
			"list_1",
			"item_1",
			"3d",
		);
	});

	it("GET active snoozes", async () => {
		getActiveSnoozes.mockResolvedValue([{ id: "snooze_1", name: "milk" }]);
		const { loader } = await import("~/routes/api/mobile/v1.supply.snoozes");
		const result = await loader({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/supply/snoozes",
			),
			context: makeContext(),
			params: {},
		} as never);
		expect(result).toEqual({ snoozes: [{ id: "snooze_1", name: "milk" }] });
	});

	it("DELETE unsnooze", async () => {
		unsnoozeSupplyItem.mockResolvedValue({ unsnoozed: true });
		const { action } = await import(
			"~/routes/api/mobile/v1.supply.snoozes.$snoozeId"
		);
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/supply/snoozes/snooze_1",
				{ method: "DELETE" },
			),
			context: makeContext(),
			params: { snoozeId: "snooze_1" },
		} as never);
		expect(result).toEqual({ unsnoozed: true });
	});
});
