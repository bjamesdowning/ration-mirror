import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { CreateTagSchema } from "~/lib/schemas/tag";
import { createTag, getOrganizationTags } from "~/lib/tags.server";
import type { Route } from "./+types/v1.tags";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"cargo_list",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const tags = await getOrganizationTags(
			context.cloudflare.env.DB,
			organizationId,
		);
		return { tags };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
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
			organizationId,
			parsed.data,
			userId,
		);
		return { tag };
	} catch (e) {
		return handleApiError(e);
	}
}
