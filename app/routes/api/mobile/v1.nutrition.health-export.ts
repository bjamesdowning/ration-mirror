import {
	getHealthExportStatus,
	putHealthExport,
} from "~/lib/nutrition/health-export.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.health-export";

/** iOS below 1.6 fails closed. The phone, not this route, writes HealthKit. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary({ request, context }, "mobile", "api_export", (started) =>
		getHealthExportStatus(started.env, started.principal, started.flags),
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PUT") methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
		"settings_mutation",
		(started) =>
			putHealthExport(request, started.env, started.principal, started.flags),
	);
}
