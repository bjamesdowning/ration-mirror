import { drizzle } from "drizzle-orm/d1";
import { data, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { deleteOrganization } from "~/lib/organizations.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/groups.delete";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });
	const env = context.cloudflare.env;

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"group_delete",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many group deletion requests. Please try again later.",
		);
	}

	const formData = await request.formData();
	const organizationId = formData.get("organizationId")?.toString();

	if (!organizationId) {
		throw data({ error: "Organization ID is required" }, { status: 400 });
	}

	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, organizationId), eq(m.userId, user.id)),
	});

	if (!membership || membership.role !== "owner") {
		throw data(
			{ error: "You must be the owner to delete this group" },
			{ status: 403 },
		);
	}

	log.info("[DeleteGroup] Request to delete org", {
		orgId: redactId(organizationId),
		userId: redactId(user.id),
	});

	try {
		await deleteOrganization(env, organizationId);
		log.info("[DeleteGroup] Successfully deleted org", {
			orgId: redactId(organizationId),
		});
	} catch (error) {
		log.error("[DeleteGroup] FATAL: Failed to delete group", error, {
			orgId: redactId(organizationId),
		});
		return handleApiError(error);
	}

	return redirect("/select-group");
}
