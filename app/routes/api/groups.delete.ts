import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/groups.delete";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"group_create",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const formData = await request.formData();
	const organizationId = formData.get("organizationId")?.toString();

	if (!organizationId) {
		throw data({ error: "Organization ID is required" }, { status: 400 });
	}

	// 1. Verify ownership
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

	// 2. Perform deletion
	log.info("[DeleteGroup] Request to delete org", {
		orgId: redactId(organizationId),
		userId: redactId(user.id),
	});

	try {
		// Execute all deletions atomically via D1 batch API
		// This ensures all-or-nothing semantics and reduces latency
		log.info("[DeleteGroup] Executing atomic deletion", {
			orgId: redactId(organizationId),
		});

		await db.batch([
			// 1. Clear active org for all sessions
			db
				.update(schema.session)
				.set({ activeOrganizationId: null })
				.where(eq(schema.session.activeOrganizationId, organizationId)),

			// 2. Delete inventory
			db
				.delete(schema.inventory)
				.where(eq(schema.inventory.organizationId, organizationId)),

			// 3. Delete grocery lists (cascade deletes grocery items)
			db
				.delete(schema.groceryList)
				.where(eq(schema.groceryList.organizationId, organizationId)),

			// 4. Delete meals (cascade deletes meal ingredients and tags)
			db
				.delete(schema.meal)
				.where(eq(schema.meal.organizationId, organizationId)),

			// 5. Delete memberships
			db
				.delete(schema.member)
				.where(eq(schema.member.organizationId, organizationId)),

			// 6. Delete ledger entries
			db
				.delete(schema.ledger)
				.where(eq(schema.ledger.organizationId, organizationId)),

			// 7. Delete invitations
			db
				.delete(schema.invitation)
				.where(eq(schema.invitation.organizationId, organizationId)),

			// 8. Delete organization record
			db
				.delete(schema.organization)
				.where(eq(schema.organization.id, organizationId)),
		]);

		log.info("[DeleteGroup] Successfully deleted org", {
			orgId: redactId(organizationId),
		});
	} catch (error) {
		log.error("[DeleteGroup] FATAL: Failed to delete group", error, {
			orgId: redactId(organizationId),
		});
		const message = error instanceof Error ? error.message : String(error);
		throw data(
			{ error: `Failed to delete group: ${message}` },
			{ status: 500 },
		);
	}

	return redirect("/select-group");
}
