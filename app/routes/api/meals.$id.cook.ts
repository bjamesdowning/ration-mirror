import type { ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { cookMeal } from "~/lib/meals.server";

export async function action({ request, params, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;

	if (!id) throw new Response("Not Found", { status: 404 });

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const result = await cookMeal(context.cloudflare.env.DB, user.id, id);
		return { result };
	} catch (e) {
		return handleApiError(e);
	}
}
