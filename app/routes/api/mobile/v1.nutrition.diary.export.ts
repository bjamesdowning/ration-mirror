import { getDiaryExport } from "~/lib/nutrition/diary-http.server";
import { withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.export";

/** GET /api/mobile/v1/nutrition/diary/export — caller rows only. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary(
		{ request, context },
		"mobile",
		"api_export",
		async (started) => {
			const body = await getDiaryExport(
				started.env,
				started.principal,
				started.flags,
			);
			return new Response(JSON.stringify(body), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
				},
			});
		},
	);
}
