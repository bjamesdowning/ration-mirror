import { postFuelPhotoConfirm } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.photo.$requestId.confirm";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const requestId = params.requestId;
	if (!requestId) methodNotAllowed();
	return withDiary({ request, context }, "mobile", "scan", (started) =>
		postFuelPhotoConfirm(
			request,
			started.env,
			started.principal,
			started.flags,
			requestId,
		),
	);
}
