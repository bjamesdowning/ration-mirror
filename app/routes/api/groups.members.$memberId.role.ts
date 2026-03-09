import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { RoleUpdateSchema } from "~/lib/schemas/groups";
import type { Route } from "./+types/groups.members.$memberId.role";

/**
 * PATCH /api/groups/members/:memberId/role - Change a group member's role.
 *
 * Authorization:
 *   - Owner can set any non-owner member to 'admin' or 'member'.
 *   - Admin can promote 'member' to 'admin' only.
 *   - Member cannot change roles.
 *   - The owner row is immutable via this endpoint.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { session, groupId } = await requireActiveGroup(context, request);
	const actorId = session.user.id;
	const targetMemberId = params.memberId;

	if (!targetMemberId) {
		throw data({ error: "Member ID required" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"group_invite",
		actorId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	try {
		const json = await request.json();
		const { role: newRole } = RoleUpdateSchema.parse(json);

		const db = drizzle(context.cloudflare.env.DB, { schema });

		const [actorMembership, targetMembership] = await Promise.all([
			db.query.member.findFirst({
				where: (m, { and, eq }) =>
					and(eq(m.organizationId, groupId), eq(m.userId, actorId)),
			}),
			db.query.member.findFirst({
				where: (m, { and, eq }) =>
					and(eq(m.organizationId, groupId), eq(m.id, targetMemberId)),
			}),
		]);

		if (
			!actorMembership ||
			!["owner", "admin"].includes(actorMembership.role)
		) {
			throw data(
				{ error: "You don't have permission to change member roles" },
				{ status: 403 },
			);
		}

		if (!targetMembership) {
			throw data({ error: "Member not found" }, { status: 404 });
		}

		// The owner role is immutable via this endpoint
		if (targetMembership.role === "owner") {
			throw data(
				{ error: "The group owner's role cannot be changed" },
				{ status: 403 },
			);
		}

		// Admins can only promote members to admin — they cannot demote other admins
		if (
			actorMembership.role === "admin" &&
			targetMembership.role === "admin" &&
			newRole === "member"
		) {
			throw data(
				{ error: "Admins cannot demote other admins" },
				{ status: 403 },
			);
		}

		await db
			.update(schema.member)
			.set({ role: newRole })
			.where(
				and(
					eq(schema.member.id, targetMemberId),
					eq(schema.member.organizationId, groupId),
				),
			);

		return { success: true, memberId: targetMemberId, role: newRole };
	} catch (e) {
		return handleApiError(e);
	}
}
