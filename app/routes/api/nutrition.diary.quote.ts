import { postDiaryQuote } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.quote";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary/quote — credit quote. This MR returns 0 and does not debit. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary({ request, context }, "web", "api_export", (started) =>
		postDiaryQuote(started.env, started.principal, started.flags),
	);
}
