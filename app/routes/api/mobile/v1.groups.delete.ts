import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { deleteOrganization } from "~/lib/organizations.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileDeleteGroupSchema } from "~/lib/schemas/mobile/groups";
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
			"group_delete",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many group deletion requests. Please try again later.",
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

		await deleteOrganization(env, organizationId);

		log.info("[MobileDeleteGroup] Successfully deleted org", {
			orgId: redactId(organizationId),
		});

		return { success: true };
	} catch (error) {
		return handleApiError(error);
	}
}
