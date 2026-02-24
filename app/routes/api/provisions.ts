import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { createProvision } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { ProvisionSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/provisions";

export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const json = await request.json();
		const input = ProvisionSchema.parse(json);

		const provision = await createProvision(
			context.cloudflare.env.DB,
			groupId,
			input,
			context.cloudflare.env,
		);
		return { provision };
	} catch (e) {
		return handleApiError(e);
	}
}
