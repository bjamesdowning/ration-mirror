import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	isPersonalOrganization,
	PERSONAL_GROUP_LEAVE_MESSAGE,
} from "~/lib/personal-group";
import type { UserSettings } from "~/lib/types";

export class GroupMembershipError extends Error {
	readonly code:
		| "forbidden"
		| "not_found"
		| "owner_cannot_leave"
		| "personal_group"
		| "cannot_remove_owner"
		| "cannot_remove_self";
	readonly status: number;

	constructor(
		message: string,
		code: GroupMembershipError["code"],
		status: number,
	) {
		super(message);
		this.name = "GroupMembershipError";
		this.code = code;
		this.status = status;
	}
}

/** Pure gate: only owners may remove non-owner members (not themselves). */
export function canRemoveGroupMember(input: {
	actorRole: string;
	actorUserId: string;
	targetRole: string;
	targetUserId: string;
}): boolean {
	if (input.actorRole !== "owner") return false;
	if (input.targetRole === "owner") return false;
	if (input.actorUserId === input.targetUserId) return false;
	return true;
}

/** Pure gate: non-owners may leave non-personal groups. */
export function canLeaveGroup(input: {
	role: string;
	isPersonalGroup: boolean;
}): boolean {
	if (input.role === "owner") return false;
	if (input.isPersonalGroup) return false;
	return true;
}

function settingsWithoutDefaultGroup(
	settings: UserSettings | null | undefined,
	organizationId: string,
): UserSettings | null {
	const current = settings ?? {};
	if (current.defaultGroupId !== organizationId) return null;
	const { defaultGroupId: _removed, ...rest } = current;
	return rest;
}

/**
 * Owner removes a non-owner member from the active group.
 * Does not delete kitchen data — only the membership row.
 */
export async function removeGroupMember(input: {
	env: Cloudflare.Env;
	organizationId: string;
	actorUserId: string;
	targetMemberId: string;
}): Promise<{ removedUserId: string; memberId: string }> {
	const { env, organizationId, actorUserId, targetMemberId } = input;
	const db = drizzle(env.DB, { schema });

	const [actorMembership, targetMembership] = await Promise.all([
		db.query.member.findFirst({
			where: (m, { and: a, eq: e }) =>
				a(e(m.organizationId, organizationId), e(m.userId, actorUserId)),
		}),
		db.query.member.findFirst({
			where: (m, { and: a, eq: e }) =>
				a(e(m.organizationId, organizationId), e(m.id, targetMemberId)),
		}),
	]);

	if (!actorMembership || actorMembership.role !== "owner") {
		throw new GroupMembershipError(
			"Only the group owner can remove members",
			"forbidden",
			403,
		);
	}

	if (!targetMembership) {
		throw new GroupMembershipError("Member not found", "not_found", 404);
	}

	if (targetMembership.role === "owner") {
		throw new GroupMembershipError(
			"The group owner cannot be removed",
			"cannot_remove_owner",
			403,
		);
	}

	if (targetMembership.userId === actorUserId) {
		throw new GroupMembershipError(
			"You cannot remove yourself. Transfer ownership or delete the group instead.",
			"cannot_remove_self",
			403,
		);
	}

	const targetUser = await db.query.user.findFirst({
		where: eq(schema.user.id, targetMembership.userId),
		columns: { settings: true },
	});
	const clearedSettings = settingsWithoutDefaultGroup(
		targetUser?.settings as UserSettings | undefined,
		organizationId,
	);

	const stmts = [
		db
			.delete(schema.member)
			.where(
				and(
					eq(schema.member.id, targetMemberId),
					eq(schema.member.organizationId, organizationId),
				),
			),
		db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(
				and(
					eq(schema.session.userId, targetMembership.userId),
					eq(schema.session.activeOrganizationId, organizationId),
				),
			),
		...(clearedSettings
			? [
					db
						.update(schema.user)
						.set({ settings: clearedSettings })
						.where(eq(schema.user.id, targetMembership.userId)),
				]
			: []),
	];

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await db.batch(stmts as [any, ...any[]]);

	return {
		removedUserId: targetMembership.userId,
		memberId: targetMemberId,
	};
}

/**
 * Non-owner leaves the active group.
 * Does not delete kitchen data — only the membership row.
 */
export async function leaveGroup(input: {
	env: Cloudflare.Env;
	organizationId: string;
	userId: string;
}): Promise<{ organizationId: string }> {
	const { env, organizationId, userId } = input;
	const db = drizzle(env.DB, { schema });

	const membership = await db.query.member.findFirst({
		where: (m, { and: a, eq: e }) =>
			a(e(m.organizationId, organizationId), e(m.userId, userId)),
	});

	if (!membership) {
		throw new GroupMembershipError(
			"You are not a member of this group",
			"not_found",
			404,
		);
	}

	if (membership.role === "owner") {
		throw new GroupMembershipError(
			"Owners cannot leave a group. Transfer ownership or delete the group instead.",
			"owner_cannot_leave",
			403,
		);
	}

	const [org, userRow] = await Promise.all([
		db.query.organization.findFirst({
			where: eq(schema.organization.id, organizationId),
			columns: { slug: true, metadata: true },
		}),
		db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: { settings: true },
		}),
	]);

	const isPersonal = org ? isPersonalOrganization(org, userId) : false;
	if (isPersonal) {
		throw new GroupMembershipError(
			PERSONAL_GROUP_LEAVE_MESSAGE,
			"personal_group",
			403,
		);
	}

	const clearedSettings = settingsWithoutDefaultGroup(
		userRow?.settings as UserSettings | undefined,
		organizationId,
	);

	const stmts = [
		db
			.delete(schema.member)
			.where(
				and(
					eq(schema.member.id, membership.id),
					eq(schema.member.organizationId, organizationId),
				),
			),
		db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(
				and(
					eq(schema.session.userId, userId),
					eq(schema.session.activeOrganizationId, organizationId),
				),
			),
		...(clearedSettings
			? [
					db
						.update(schema.user)
						.set({ settings: clearedSettings })
						.where(eq(schema.user.id, userId)),
				]
			: []),
	];

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await db.batch(stmts as [any, ...any[]]);

	return { organizationId };
}
