import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import type { Route } from "./+types/api-keys.$id";

/**
 * DELETE /api/api-keys/:id - Revoke an API key (session auth).
 * Key must belong to current organization.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const id = params.id;

	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	if (!id) {
		throw data({ error: "Key ID required" }, { status: 400 });
	}

	try {
		const db = drizzle(context.cloudflare.env.DB, { schema });

		const [deleted] = await db
			.delete(schema.apiKey)
			.where(
				and(
					eq(schema.apiKey.id, id),
					eq(schema.apiKey.organizationId, groupId),
				),
			)
			.returning({ id: schema.apiKey.id });

		if (!deleted) {
			throw data(
				{ error: "API key not found or unauthorized" },
				{ status: 404 },
			);
		}

		return { success: true, revoked: id };
	} catch (e) {
		return handleApiError(e);
	}
}
