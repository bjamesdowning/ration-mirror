import { postDiaryKitchenSave } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.$id.save-to-kitchen";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const intakeId = params.id;
	if (!intakeId) methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
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
