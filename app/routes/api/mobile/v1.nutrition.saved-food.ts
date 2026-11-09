import {
	getSavedFoodList,
	postSavedFood,
} from "~/lib/nutrition/saved-food-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.saved-food";

/** GET/POST /api/mobile/v1/nutrition/saved-food — iOS below 1.6 fails closed. */
export async function loader({ request, context }: Route.LoaderArgs) {
	if (request.method !== "GET") methodNotAllowed();
	return withDiary({ request, context }, "mobile", "api_export", (started) =>
		getSavedFoodList(started.env, started.principal, started.flags),
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
		"settings_mutation",
		(started) =>
			postSavedFood(request, started.env, started.principal, started.flags),
	);
}
