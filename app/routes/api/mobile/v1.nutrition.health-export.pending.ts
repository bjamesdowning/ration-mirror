import { getPendingHealthExport } from "~/lib/nutrition/health-export.server";
import { withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.health-export.pending";

/** Pending feed for the signed-in person. iOS below 1.6 fails closed. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary({ request, context }, "mobile", "api_export", (started) =>
		getPendingHealthExport(
			request,
			started.env,
			started.principal,
			started.flags,
		),
	);
}
