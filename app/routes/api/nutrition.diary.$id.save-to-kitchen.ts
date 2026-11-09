import { postDiaryKitchenSave } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.$id.save-to-kitchen";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary/:id/save-to-kitchen — confirm required. Not part of log. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const intakeId = params.id;
	if (!intakeId) methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			postDiaryKitchenSave(
				request,
				started.env,
				started.principal,
				started.flags,
				intakeId,
			),
	);
}
