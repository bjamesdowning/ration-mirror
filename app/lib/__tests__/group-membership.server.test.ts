import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMember = vi.fn();
const findFirstUser = vi.fn();
const findFirstOrganization = vi.fn();
const dbBatch = vi.fn();
const deleteWhere = vi.fn(() => ({}) as unknown);
const updateSet = vi.fn(() => ({ where: vi.fn(() => ({}) as unknown) }));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
			user: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
			organization: {
				findFirst: (...a: unknown[]) => findFirstOrganization(...a),
			},
		},
		delete: () => ({ where: deleteWhere }),
		update: () => ({ set: updateSet }),
		batch: (...a: unknown[]) => dbBatch(...a),
	}),
}));

import {
	canLeaveGroup,
	canRemoveGroupMember,
	leaveGroup,
	removeGroupMember,
} from "~/lib/group-membership.server";

const env = { DB: {} } as Cloudflare.Env;

describe("canRemoveGroupMember", () => {
	it("allows owner to remove admin or member", () => {
		expect(
			canRemoveGroupMember({
				actorRole: "owner",
				actorUserId: "u1",
				targetRole: "admin",
				targetUserId: "u2",
			}),
		).toBe(true);
		expect(
			canRemoveGroupMember({
				actorRole: "owner",
				actorUserId: "u1",
				targetRole: "member",
				targetUserId: "u3",
			}),
		).toBe(true);
	});

	it("rejects removing the owner row", () => {
		expect(
			canRemoveGroupMember({
				actorRole: "owner",
				actorUserId: "u1",
				targetRole: "owner",
				targetUserId: "u1",
			}),
		).toBe(false);
	});

	it("rejects owner removing themselves via remove path", () => {
		expect(
			canRemoveGroupMember({
				actorRole: "owner",
				actorUserId: "u1",
				targetRole: "member",
				targetUserId: "u1",
			}),
		).toBe(false);
	});

	it("rejects admin and member actors", () => {
		expect(
			canRemoveGroupMember({
				actorRole: "admin",
				actorUserId: "u2",
				targetRole: "member",
				targetUserId: "u3",
			}),
		).toBe(false);
		expect(
			canRemoveGroupMember({
				actorRole: "member",
				actorUserId: "u3",
				targetRole: "member",
				targetUserId: "u4",
			}),
		).toBe(false);
	});
});

describe("canLeaveGroup", () => {
	it("allows admin and member on non-personal groups", () => {
		expect(canLeaveGroup({ role: "admin", isPersonalGroup: false })).toBe(true);
		expect(canLeaveGroup({ role: "member", isPersonalGroup: false })).toBe(
			true,
		);
	});

	it("rejects owners", () => {
		expect(canLeaveGroup({ role: "owner", isPersonalGroup: false })).toBe(
			false,
		);
	});

	it("rejects personal groups", () => {
		expect(canLeaveGroup({ role: "member", isPersonalGroup: true })).toBe(
			false,
		);
	});
});

describe("removeGroupMember", () => {
	beforeEach(() => {
		for (const m of [
			findFirstMember,
			findFirstUser,
			findFirstOrganization,
			dbBatch,
			deleteWhere,
			updateSet,
		]) {
			m.mockReset();
		}
		dbBatch.mockResolvedValue(undefined);
	});

	it("rejects non-owners", async () => {
		findFirstMember
			.mockResolvedValueOnce({ id: "m1", role: "admin", userId: "u1" })
			.mockResolvedValueOnce({ id: "m2", role: "member", userId: "u2" });

		await expect(
			removeGroupMember({
				env,
				organizationId: "org_1",
				actorUserId: "u1",
				targetMemberId: "m2",
			}),
		).rejects.toMatchObject({ code: "forbidden", status: 403 });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("batches member delete + session clear + defaultGroup clear", async () => {
		findFirstMember
			.mockResolvedValueOnce({ id: "m1", role: "owner", userId: "u1" })
			.mockResolvedValueOnce({ id: "m2", role: "member", userId: "u2" });
		findFirstUser.mockResolvedValueOnce({
			settings: { defaultGroupId: "org_1", theme: "light" },
		});

		const result = await removeGroupMember({
			env,
			organizationId: "org_1",
			actorUserId: "u1",
			targetMemberId: "m2",
		});

		expect(result).toEqual({ removedUserId: "u2", memberId: "m2" });
		expect(dbBatch).toHaveBeenCalledTimes(1);
		const stmts = dbBatch.mock.calls[0][0] as unknown[];
		expect(stmts).toHaveLength(3);
		expect(updateSet).toHaveBeenCalledWith({
			settings: { theme: "light" },
		});
	});

	it("batches without settings update when defaultGroup differs", async () => {
		findFirstMember
			.mockResolvedValueOnce({ id: "m1", role: "owner", userId: "u1" })
			.mockResolvedValueOnce({ id: "m2", role: "admin", userId: "u2" });
		findFirstUser.mockResolvedValueOnce({
			settings: { defaultGroupId: "other_org" },
		});

		await removeGroupMember({
			env,
			organizationId: "org_1",
			actorUserId: "u1",
			targetMemberId: "m2",
		});

		const stmts = dbBatch.mock.calls[0][0] as unknown[];
		expect(stmts).toHaveLength(2);
	});
});

describe("leaveGroup", () => {
	beforeEach(() => {
		for (const m of [
			findFirstMember,
			findFirstUser,
			findFirstOrganization,
			dbBatch,
			deleteWhere,
			updateSet,
		]) {
			m.mockReset();
		}
		dbBatch.mockResolvedValue(undefined);
	});

	it("rejects owners", async () => {
		findFirstMember.mockResolvedValue({
			id: "m1",
			role: "owner",
			userId: "u1",
		});

		await expect(
			leaveGroup({ env, organizationId: "org_1", userId: "u1" }),
		).rejects.toMatchObject({ code: "owner_cannot_leave", status: 403 });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("rejects personal groups", async () => {
		findFirstMember.mockResolvedValueOnce({
			id: "m1",
			role: "member",
			userId: "u1",
		});
		findFirstOrganization.mockResolvedValueOnce({
			slug: "family",
			metadata: { isPersonal: true },
		});
		findFirstUser.mockResolvedValueOnce({ settings: {} });

		await expect(
			leaveGroup({ env, organizationId: "org_1", userId: "u1" }),
		).rejects.toMatchObject({ code: "personal_group", status: 403 });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("batches leave delete + session clear + defaultGroup clear", async () => {
		findFirstMember.mockResolvedValueOnce({
			id: "m1",
			role: "member",
			userId: "u1",
		});
		findFirstOrganization.mockResolvedValueOnce({
			slug: "crew-kitchen",
			metadata: { isPersonal: false },
		});
		findFirstUser.mockResolvedValueOnce({
			settings: { defaultGroupId: "org_1" },
		});

		const result = await leaveGroup({
			env,
			organizationId: "org_1",
			userId: "u1",
		});

		expect(result).toEqual({ organizationId: "org_1" });
		expect(dbBatch).toHaveBeenCalledTimes(1);
		const stmts = dbBatch.mock.calls[0][0] as unknown[];
		expect(stmts).toHaveLength(3);
		expect(updateSet).toHaveBeenCalledWith({ settings: {} });
	});
});
