import { getFuelPhoto } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.photo.$requestId";

export async function loader({ request, context, params }: Route.LoaderArgs) {
	const requestId = params.requestId;
	if (!requestId) methodNotAllowed();
	return withDiary({ request, context }, "mobile", "scan", (started) =>
		getFuelPhoto(started.env, started.principal, requestId),
	);
}
