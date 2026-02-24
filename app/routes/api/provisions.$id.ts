import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { updateProvision } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { ProvisionUpdateSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/provisions.$id";

export async function action({ request, params, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const json = await request.json();
		const input = ProvisionUpdateSchema.parse(json);

		const provision = await updateProvision(
			context.cloudflare.env.DB,
			groupId,
			id,
			input,
		);
		return { provision };
	} catch (e) {
		return handleApiError(e);
	}
}
