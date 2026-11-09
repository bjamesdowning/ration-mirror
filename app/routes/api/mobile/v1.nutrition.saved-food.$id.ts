import { deleteSavedFoodRequest } from "~/lib/nutrition/saved-food-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.saved-food.$id";

/** DELETE /api/mobile/v1/nutrition/saved-food/:id */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
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
