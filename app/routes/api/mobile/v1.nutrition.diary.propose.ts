import { postProposeFoodLog } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.propose";

/** POST /api/mobile/v1/nutrition/diary/propose — iOS below 1.6 fails closed. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
		"settings_mutation",
		(started) =>
			postProposeFoodLog(
				request,
				started.env,
				started.principal,
				started.flags,
			),
	);
}
