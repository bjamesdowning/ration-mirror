import { data } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const memberFindMany = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: {
				findMany: (...args: unknown[]) => memberFindMany(...args),
			},
		},
	}),
}));

const ctx = { cloudflare: { env: { DB: {} } } } as never;

function getRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/groups/members");
}

describe("GET /api/mobile/v1/groups/members", () => {
	beforeEach(() => {
		for (const m of [requireMobileActiveGroup, memberFindMany]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		memberFindMany.mockResolvedValue([
			{
				id: "member_1",
				role: "owner",
				user: {
					name: "Alex",
					email: "alex@example.com",
					image: "https://example.com/avatar.png",
				},
			},
			{
				id: "member_2",
				role: "member",
				user: {
					name: "Blake",
					email: "blake@example.com",
					image: null,
				},
			},
		]);
	});

	it("returns members with id, role, and user profile fields", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.groups.members");
		const result = (await loader({
			request: getRequest(),
			context: ctx,
			params: {},
		} as never)) as {
			members: Array<{
				id: string;
				role: string;
				user: { name: string; email: string; image: string | null };
			}>;
		};

		expect(requireMobileActiveGroup).toHaveBeenCalled();
		expect(memberFindMany).toHaveBeenCalled();
		expect(result.members).toEqual([
			{
				id: "member_1",
				role: "owner",
				user: {
					name: "Alex",
					email: "alex@example.com",
					image: "https://example.com/avatar.png",
				},
			},
			{
				id: "member_2",
				role: "member",
				user: {
					name: "Blake",
					email: "blake@example.com",
					image: null,
				},
			},
		]);
	});

	it("propagates auth failures from requireMobileActiveGroup", async () => {
		requireMobileActiveGroup.mockImplementation(() => {
			throw data({ error: "Unauthorized" }, { status: 401 });
		});
		const { loader } = await import("~/routes/api/mobile/v1.groups.members");
		await expect(
			loader({
				request: getRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 401 } });
		expect(memberFindMany).not.toHaveBeenCalled();
	});
});
