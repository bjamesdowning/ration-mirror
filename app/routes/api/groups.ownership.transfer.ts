import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	assertCanOwnAnotherGroup,
	buildRecipientCapacityExceededPayload,
	invalidateTierCache,
} from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { TransferOwnershipSchema } from "~/lib/schemas/groups";
import type { Route } from "./+types/groups.ownership.transfer";

/**
 * POST /api/groups/ownership/transfer - Transfer group ownership to another member.
 *
 * Authorization: Only the current owner can transfer ownership.
 * The target must be an existing admin or member of the same group.
 * After transfer, the former owner becomes a regular member.
 */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { session, groupId } = await requireActiveGroup(context, request);
	const actorId = session.user.id;

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"group_ownership_transfer",
		actorId,
	);

	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const json = await request.json();
		const { newOwnerMemberId } = TransferOwnershipSchema.parse(json);

		const db = drizzle(context.cloudflare.env.DB, { schema });

		const [actorMembership, targetMembership] = await Promise.all([
			db.query.member.findFirst({
				where: (m, { and, eq }) =>
					and(eq(m.organizationId, groupId), eq(m.userId, actorId)),
			}),
			db.query.member.findFirst({
				where: (m, { and, eq }) =>
					and(eq(m.organizationId, groupId), eq(m.id, newOwnerMemberId)),
			}),
		]);

		if (!actorMembership || actorMembership.role !== "owner") {
			return data(
				{ error: "Only the group owner can transfer ownership" },
				{ status: 403 },
			);
		}

		if (!targetMembership) {
			return data({ error: "Member not found" }, { status: 404 });
		}

		if (targetMembership.role === "owner") {
			return data(
				{ error: "The selected member is already the owner" },
				{ status: 400 },
			);
		}

		if (targetMembership.userId === actorId) {
			return data(
				{ error: "You cannot transfer ownership to yourself" },
				{ status: 400 },
			);
		}

		const recipientCapacity = await assertCanOwnAnotherGroup(
			context.cloudflare.env,
			targetMembership.userId,
		);
		if (!recipientCapacity.allowed) {
			return data(buildRecipientCapacityExceededPayload(recipientCapacity), {
				status: 403,
			});
		}

		// Atomic: promote new owner and demote current owner
		await db.batch([
			db
				.update(schema.member)
				.set({ role: "owner" })
				.where(
					and(
						eq(schema.member.id, newOwnerMemberId),
						eq(schema.member.organizationId, groupId),
					),
				),
			db
				.update(schema.member)
				.set({ role: "member" })
				.where(
					and(
						eq(schema.member.id, actorMembership.id),
						eq(schema.member.organizationId, groupId),
					),
				),
		]);

		await invalidateTierCache(context.cloudflare.env, groupId);

		return { success: true };
	} catch (e) {
		return handleApiError(e);
	}
}
