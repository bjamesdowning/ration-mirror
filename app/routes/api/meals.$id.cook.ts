import { data } from "react-router";
import { z } from "zod";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { cookMeal } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.$id.cook";

const CookRequestSchema = z.object({
	servings: z.coerce.number().int().min(1).optional(),
});

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
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	// Parse optional servings from FormData or JSON body
	let servings: number | undefined;
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const json = await request.json();
			const parsed = CookRequestSchema.safeParse(json);
			if (parsed.success) servings = parsed.data.servings;
		} else {
			const formData = await request.formData();
			const raw = formData.get("servings");
			if (raw != null) {
				const parsed = CookRequestSchema.safeParse({ servings: raw });
				if (parsed.success) servings = parsed.data.servings;
			}
		}
	} catch {
		// Unparseable body — proceed without servings override
	}

	try {
		const result = await cookMeal(context.cloudflare.env.DB, groupId, id, {
			servings,
		});
		return { result };
	} catch (e) {
		return handleApiError(e);
	}
}
