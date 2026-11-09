import { postClearHealthExport } from "~/lib/nutrition/health-export.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.health-export.clear";

/** Asks the device to delete Ration's own samples. Does not write HealthKit. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
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
