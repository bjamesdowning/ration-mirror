import { postDiaryLog } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary";

/** POST /api/mobile/v1/nutrition/diary — iOS below 1.6 fails closed. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
		"settings_mutation",
		(started) =>
			postDiaryLog(request, started.env, started.principal, started.flags),
	);
}
