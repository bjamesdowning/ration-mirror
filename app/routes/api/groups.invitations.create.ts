import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/groups.invitations.create";

const MAX_ACTIVE_INVITATIONS_PER_GROUP = 10;
const INVITATION_EXPIRY_DAYS = 7;

export async function action({ request, context }: Route.ActionArgs) {
	const { session, groupId } = await requireActiveGroup(context, request);
	const userId = session.user.id;

	// Rate limiting to prevent invitation spam
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"group_invite",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many invitation requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	// SECURITY: Verify user has permission to invite (owner or admin only)
	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, groupId), eq(m.userId, userId)),
	});

	if (!membership || !["owner", "admin"].includes(membership.role)) {
		throw data(
			{ error: "You don't have permission to invite members to this group" },
			{ status: 403 },
		);
	}

	const tierLimits = await getGroupTierLimits(context.cloudflare.env, groupId);
	if (!tierLimits.limits.canInviteMembers) {
		throw data(
			{
				error: "feature_gated",
				feature: "invite_members",
				tier: tierLimits.tier,
				upgradePath: "crew_member",
			},
			{ status: 403 },
		);
	}

	// BUSINESS RULE: Check active invitation limit
	const activeInvitations = await db
		.select()
		.from(schema.invitation)
		.where(
			and(
				eq(schema.invitation.organizationId, groupId),
				eq(schema.invitation.status, "pending"),
			),
		);

	if (activeInvitations.length >= MAX_ACTIVE_INVITATIONS_PER_GROUP) {
		throw data(
			{
				error: `Maximum of ${MAX_ACTIVE_INVITATIONS_PER_GROUP} active invitations reached. Please cancel some invitations first.`,
			},
			{ status: 400 },
		);
	}

	// Generate invitation with proper expiry
	const token = crypto.randomUUID();
	const expiresAt = new Date(
		Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
	);

	const [invitation] = await db
		.insert(schema.invitation)
		.values({
			id: crypto.randomUUID(),
			organizationId: groupId,
			token,
			role: "member", // Default role for invitations
			status: "pending",
			expiresAt,
			inviterId: userId,
		})
		.returning();

	// Return invitation ID for the accept route
	return {
		success: true,
		invitationId: invitation.id,
		expiresAt: invitation.expiresAt,
	};
}
