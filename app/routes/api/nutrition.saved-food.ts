import {
	getSavedFoodList,
	postSavedFood,
} from "~/lib/nutrition/saved-food-http.server";
import type { Route } from "./+types/nutrition.saved-food";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** GET/POST /api/nutrition/saved-food — the signed-in person's foods only. */
export async function loader({ request, context }: Route.LoaderArgs) {
	if (request.method !== "GET") methodNotAllowed();
	return withDiary({ request, context }, "web", "api_export", (started) =>
		getSavedFoodList(started.env, started.principal, started.flags),
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			postSavedFood(request, started.env, started.principal, started.flags),
	);
}
