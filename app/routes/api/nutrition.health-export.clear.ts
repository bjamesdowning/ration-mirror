import { postClearHealthExport } from "~/lib/nutrition/health-export.server";
import type { Route } from "./+types/nutrition.health-export.clear";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST confirm:true asks the device to delete samples this app wrote. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			postClearHealthExport(
				request,
				started.env,
				started.principal,
				started.flags,
			),
	);
}
