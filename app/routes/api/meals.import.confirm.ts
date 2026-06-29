/**
 * POST /api/meals/import/confirm
 * Persists an extracted recipe from a completed import job to the Galley.
 * Call after the user confirms the verification screen.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { confirmRecipeImport } from "~/lib/recipe-import-confirm.server";
import { ImportConfirmRequestSchema } from "~/lib/schemas/recipe-import";
import type { Route } from "./+types/meals.import.confirm";

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return data({ error: "Invalid JSON body" }, { status: 400 });
		}

		const parsed = ImportConfirmRequestSchema.safeParse(body);
		if (!parsed.success) {
			const firstIssue = parsed.error.issues[0];
			return data(
				{ error: firstIssue?.message ?? "Invalid request" },
				{ status: 400 },
			);
		}

		return data(
			await confirmRecipeImport(context.cloudflare.env, {
				organizationId: groupId,
				requestId: parsed.data.requestId,
			}),
		);
	} catch (err) {
		return handleApiError(err);
	}
}
