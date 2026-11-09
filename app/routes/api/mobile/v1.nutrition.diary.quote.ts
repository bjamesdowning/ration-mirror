import { postDiaryQuote } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.quote";

/** POST /api/mobile/v1/nutrition/diary/quote — returns 0 credits. Does not debit. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary({ request, context }, "mobile", "api_export", (started) =>
		postDiaryQuote(started.env, started.principal, started.flags),
	);
}
