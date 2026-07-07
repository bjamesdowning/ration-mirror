import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { invalidateTierCache } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { TransferOwnershipSchema } from "~/lib/schemas/mobile/groups";
import type { Route } from "./+types/v1.groups.ownership.transfer";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId: actorId, organizationId: groupId } =
			await requireMobileActiveGroup(context, request);

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
			throw data(
				{ error: "Only the group owner can transfer ownership" },
				{ status: 403 },
			);
		}

		if (!targetMembership) {
			throw data({ error: "Member not found" }, { status: 404 });
		}

		if (targetMembership.role === "owner") {
			throw data(
				{ error: "The selected member is already the owner" },
				{ status: 400 },
			);
		}

		if (targetMembership.userId === actorId) {
			throw data(
				{ error: "You cannot transfer ownership to yourself" },
				{ status: 400 },
			);
		}

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
	} catch (error) {
		return handleApiError(error);
	}
}
