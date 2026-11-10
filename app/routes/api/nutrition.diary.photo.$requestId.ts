import { getFuelPhoto } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.photo.$requestId";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** GET /api/nutrition/diary/photo/:requestId — owner poll. */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const requestId = params.requestId;
	if (!requestId) methodNotAllowed();
	return withDiary({ request, context }, "web", "scan", (started) =>
		getFuelPhoto(started.env, started.principal, requestId),
	);
}

export function action() {
	methodNotAllowed();
}
