import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { data } from "~/lib/response";

export async function action({ request, context }: ActionFunctionArgs) {
	const { user, session } = await requireAuth(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

	const formData = await request.formData();
	const organizationId = formData.get("organizationId")?.toString();

	if (!organizationId) {
		throw data({ error: "Organization ID is required" }, { status: 400 });
	}

	// preventing deletion of the currently active org if it is the only one might be nice,
	// but the user can just be redirected.

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
	try {
		// SQLite with foreign keys enabled should cascade delete:
		// - members
		// - inventory
		// - meals
		// - grocery_lists
		// - ledger
		// - invitations
		await db
			.delete(schema.organization)
			.where(eq(schema.organization.id, organizationId));

		// If the deleted group was the active one, we need to handle that.
		// The session might still point to it.
		if (session.session.activeOrganizationId === organizationId) {
			// Update session to remove active org
			await db
				.update(schema.session)
				.set({ activeOrganizationId: null })
				.where(eq(schema.session.id, session.session.id));
		}
	} catch (error) {
		console.error("Failed to delete group:", error);
		throw data(
			{ error: "Failed to delete group. Please try again." },
			{ status: 500 },
		);
	}

	return redirect("/select-group");
}
