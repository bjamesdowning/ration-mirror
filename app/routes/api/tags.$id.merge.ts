import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MergeTagSchema } from "~/lib/schemas/tag";
import { getTagById, mergeTags } from "~/lib/tags.server";
import type { Route } from "./+types/tags.$id.merge";

export async function action({ request, context, params }: Route.ActionArgs) {
	try {
		const { groupId, session } = await requireActiveGroup(context, request);
		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			session.user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(rateLimitResult, "Too many requests.");
		}

		const tagId = params.id;
		if (!tagId) {
			throw data({ error: "Tag ID required" }, { status: 400 });
		}

		const body = await request.json();
		const parsed = MergeTagSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", issues: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const db = context.cloudflare.env.DB;
		const source = await getTagById(db, groupId, tagId);
		if (!source) {
			throw data({ error: "Source tag not found" }, { status: 404 });
		}

		const target = await getTagById(db, groupId, parsed.data.targetId);
		if (!target) {
			throw data({ error: "Target tag not found" }, { status: 404 });
		}

		const tag = await mergeTags(db, groupId, tagId, parsed.data.targetId);
		if (!tag) {
			throw data({ error: "Merge failed" }, { status: 500 });
		}

		return { tag, merged: true };
	} catch (e) {
		return handleApiError(e);
	}
}
