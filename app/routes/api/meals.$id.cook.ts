import { type ActionFunctionArgs, data } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { cookMeal } from "~/lib/meals.server";

export async function action({ request, params, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw new Response("Not Found", { status: 404 });

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const result = await cookMeal(context.env.DB, user.id, id);
		return { result };
	} catch (e) {
		console.error(e);
		return data({ error: "Internal Server Error" }, { status: 500 });
	}
}
