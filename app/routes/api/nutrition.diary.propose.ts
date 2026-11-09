import { postProposeFoodLog } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.propose";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary/propose — a draft, not intake. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
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
