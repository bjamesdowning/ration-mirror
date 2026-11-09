import { getPendingHealthExport } from "~/lib/nutrition/health-export.server";
import type { Route } from "./+types/nutrition.health-export.pending";
import { withDiary } from "./nutrition.diary.shared";

/** GET rows the device may write. Flag off is FEATURE_DISABLED. */
export async function loader({ request, context }: Route.LoaderArgs) {
	return withDiary({ request, context }, "web", "api_export", (started) =>
		getPendingHealthExport(
			request,
			started.env,
			started.principal,
			started.flags,
		),
	);
}
