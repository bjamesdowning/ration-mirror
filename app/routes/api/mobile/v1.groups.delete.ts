import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileDeleteGroupSchema } from "~/lib/schemas/mobile/groups";
import { deleteCargoVectors } from "~/lib/vector.server";
import type { Route } from "./+types/v1.groups.delete";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const env = context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"group_create",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const parsed = MobileDeleteGroupSchema.safeParse(body);
		if (!parsed.success) {
			return handleApiError(parsed.error);
		}

		const { organizationId, confirmSlug } = parsed.data;

		const membership = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(eq(m.organizationId, organizationId), eq(m.userId, userId)),
		});

		if (!membership || membership.role !== "owner") {
			throw data(
				{ error: "You must be the owner to delete this group" },
				{ status: 403 },
			);
		}

		if (confirmSlug) {
			const org = await db.query.organization.findFirst({
				where: (o, { eq }) => eq(o.id, organizationId),
				columns: { slug: true },
			});
			if (!org || org.slug !== confirmSlug) {
				throw data(
					{ error: "Confirmation slug does not match this group" },
					{ status: 400 },
				);
			}
		}

		log.info("[MobileDeleteGroup] Request to delete org", {
			orgId: redactId(organizationId),
			userId: redactId(userId),
		});

		try {
			const cargoRows = await db
				.select({ id: schema.cargo.id })
				.from(schema.cargo)
				.where(eq(schema.cargo.organizationId, organizationId));
			const cargoIds = cargoRows.map((r) => r.id);

			if (cargoIds.length > 0) {
				await deleteCargoVectors(env, cargoIds);
				log.info("[MobileDeleteGroup] Cleaned up Vectorize vectors", {
					count: cargoIds.length,
					orgId: redactId(organizationId),
				});
			}

			await db.batch([
				db
					.update(schema.session)
					.set({ activeOrganizationId: null })
					.where(eq(schema.session.activeOrganizationId, organizationId)),
				db
					.delete(schema.cargo)
					.where(eq(schema.cargo.organizationId, organizationId)),
				db
					.delete(schema.supplyList)
					.where(eq(schema.supplyList.organizationId, organizationId)),
				db
					.delete(schema.meal)
					.where(eq(schema.meal.organizationId, organizationId)),
				db
					.delete(schema.member)
					.where(eq(schema.member.organizationId, organizationId)),
				db
					.delete(schema.ledger)
					.where(eq(schema.ledger.organizationId, organizationId)),
				db
					.delete(schema.invitation)
					.where(eq(schema.invitation.organizationId, organizationId)),
				db
					.delete(schema.organization)
					.where(eq(schema.organization.id, organizationId)),
			]);

			log.info("[MobileDeleteGroup] Successfully deleted org", {
				orgId: redactId(organizationId),
			});
		} catch (error) {
			log.error("[MobileDeleteGroup] FATAL: Failed to delete group", error, {
				orgId: redactId(organizationId),
			});
			throw data(
				{
					error:
						"Failed to delete group. Please try again later or contact support.",
				},
				{ status: 500 },
			);
		}

		return { success: true };
	} catch (error) {
		return handleApiError(error);
	}
}
