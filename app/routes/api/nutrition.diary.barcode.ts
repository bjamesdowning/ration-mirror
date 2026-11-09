import { postFoodBarcode } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.barcode";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary/barcode — lookup only. Does not write intake, Cargo, or Supply. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) => postFoodBarcode(request, started.env, started.flags),
	);
}
