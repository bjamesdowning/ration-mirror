import { getDiaryExport } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.export";
import { withDiary } from "./nutrition.diary.shared";

/** GET /api/nutrition/diary/export — person-scoped JSON. Caller rows only. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary(
		{ request, context },
		"web",
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
					"Content-Disposition": `attachment; filename="ration-diary-${body.exportedAt.slice(0, 10)}.json"`,
				},
			});
		},
	);
}
