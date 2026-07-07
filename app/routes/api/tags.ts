import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CreateTagSchema } from "~/lib/schemas/tag";
import { createTag, getOrganizationTags } from "~/lib/tags.server";
import type { Route } from "./+types/tags";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { groupId, session } = await requireActiveGroup(context, request);
		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"cargo_list",
			session.user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(rateLimitResult, "Too many requests.");
		}
		const tags = await getOrganizationTags(context.cloudflare.env.DB, groupId);
		return { tags };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
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

		const body = await request.json();
		const parsed = CreateTagSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", issues: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const tag = await createTag(
			context.cloudflare.env.DB,
			groupId,
			parsed.data,
			session.user.id,
		);
		return { tag };
	} catch (e) {
		return handleApiError(e);
	}
}
