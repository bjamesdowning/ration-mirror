import { deleteSavedFoodRequest } from "~/lib/nutrition/saved-food-http.server";
import type { Route } from "./+types/nutrition.saved-food.$id";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** DELETE /api/nutrition/saved-food/:id — confirm required. Does not void intake. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			deleteSavedFoodRequest(
				request,
				started.env,
				started.principal,
				started.flags,
				params.id,
			),
	);
}
