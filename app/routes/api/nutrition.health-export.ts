import {
	getHealthExportStatus,
	putHealthExport,
} from "~/lib/nutrition/health-export.server";
import type { Route } from "./+types/nutrition.health-export";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** GET status or PUT the person-scoped preference. The server does not write HealthKit. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary({ request, context }, "web", "api_export", (started) =>
		getHealthExportStatus(started.env, started.principal, started.flags),
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PUT") methodNotAllowed();
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		(started) =>
			putHealthExport(request, started.env, started.principal, started.flags),
	);
}
