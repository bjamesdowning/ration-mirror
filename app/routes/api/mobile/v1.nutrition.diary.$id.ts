import {
	deleteDiaryLog,
	patchDiaryLog,
} from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.$id";

export async function action({ request, context, params }: Route.ActionArgs) {
	const intakeId = params.id;
	if (!intakeId) methodNotAllowed();
	if (request.method === "PATCH") {
		return withDiary(
			{ request, context },
			"mobile",
			"settings_mutation",
			(started) =>
				patchDiaryLog(
					request,
					started.env,
					started.principal,
					started.flags,
					intakeId,
				),
		);
	}
	if (request.method === "DELETE") {
		return withDiary(
			{ request, context },
			"mobile",
			"settings_mutation",
			(started) =>
				deleteDiaryLog(
					request,
					started.env,
					started.principal,
					started.flags,
					intakeId,
				),
		);
	}
	methodNotAllowed();
}
