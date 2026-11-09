import { postDiaryLog } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary — personal log. Does not change Cargo or Manifest. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			postDiaryLog(request, started.env, started.principal, started.flags),
	);
}
