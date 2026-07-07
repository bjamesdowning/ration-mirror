import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { UpdateTagSchema } from "~/lib/schemas/tag";
import { deleteTag, getTagById, updateTag } from "~/lib/tags.server";
import type { Route } from "./+types/tags.$id";

export async function action({ request, context, params }: Route.ActionArgs) {
	try {
		const { groupId, session } = await requireActiveGroup(context, request);
		const tagId = params.id;
		if (!tagId) {
			throw data({ error: "Tag ID required" }, { status: 400 });
		}

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			session.user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(rateLimitResult, "Too many requests.");
		}

		const db = context.cloudflare.env.DB;

		if (request.method === "PATCH") {
			const body = await request.json();
			const parsed = UpdateTagSchema.safeParse(body);
			if (!parsed.success) {
				throw data(
					{ error: "Invalid request", issues: parsed.error.flatten() },
					{ status: 400 },
				);
			}
			try {
				const tag = await updateTag(db, groupId, tagId, parsed.data);
				if (!tag) throw data({ error: "Tag not found" }, { status: 404 });
				return { tag };
			} catch (e) {
				if (e instanceof Error && e.message === "tag_slug_conflict") {
					throw data({ error: "Tag slug already exists" }, { status: 409 });
				}
				throw e;
			}
		}

		if (request.method === "DELETE") {
			const deleted = await deleteTag(db, groupId, tagId);
			if (!deleted) throw data({ error: "Tag not found" }, { status: 404 });
			return { success: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const { groupId } = await requireActiveGroup(context, request);
		const tagId = params.id;
		if (!tagId) throw data({ error: "Tag ID required" }, { status: 400 });
		const tag = await getTagById(context.cloudflare.env.DB, groupId, tagId);
		if (!tag) throw data({ error: "Tag not found" }, { status: 404 });
		return { tag };
	} catch (e) {
		return handleApiError(e);
	}
}
