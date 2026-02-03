import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";

export async function action({ request, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

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
	console.log(
		`[DeleteGroup] Request to delete org ${organizationId} by user ${user.id}`,
	);

	try {
		// D1 does not support BEGIN/COMMIT via the driver in standard Drizzle transactions.
		// We execute the commands sequentially. Since this is a final deletion,
		// partial failure is rare and better than a transaction fail.

		console.log("[DeleteGroup] 1. Clearing active org for all sessions...");
		await db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(eq(schema.session.activeOrganizationId, organizationId));

		console.log("[DeleteGroup] 2. Deleting inventory...");
		await db
			.delete(schema.inventory)
			.where(eq(schema.inventory.organizationId, organizationId));

		console.log("[DeleteGroup] 3. Deleting grocery lists...");
		await db
			.delete(schema.groceryList)
			.where(eq(schema.groceryList.organizationId, organizationId));

		console.log("[DeleteGroup] 4. Deleting meals...");
		await db
			.delete(schema.meal)
			.where(eq(schema.meal.organizationId, organizationId));

		console.log("[DeleteGroup] 5. Deleting memberships...");
		await db
			.delete(schema.member)
			.where(eq(schema.member.organizationId, organizationId));

		console.log("[DeleteGroup] 6. Deleting ledger entries...");
		await db
			.delete(schema.ledger)
			.where(eq(schema.ledger.organizationId, organizationId));

		console.log("[DeleteGroup] 7. Deleting invitations...");
		await db
			.delete(schema.invitation)
			.where(eq(schema.invitation.organizationId, organizationId));

		console.log("[DeleteGroup] 8. Deleting organization record...");
		await db
			.delete(schema.organization)
			.where(eq(schema.organization.id, organizationId));

		console.log(`[DeleteGroup] Successfully deleted org ${organizationId}`);
	} catch (error) {
		console.error(
			`[DeleteGroup] FATAL: Failed to delete group ${organizationId}:`,
			error,
		);
		const message = error instanceof Error ? error.message : String(error);
		throw data(
			{ error: `Failed to delete group: ${message}` },
			{ status: 500 },
		);
	}

	return redirect("/select-group");
}
