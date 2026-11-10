import { postFuelPhotoConfirm } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.photo.$requestId.confirm";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST confirm writes one intake through the cap. It does not debit again. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const requestId = params.requestId;
	if (!requestId) methodNotAllowed();
	return withDiary({ request, context }, "web", "scan", (started) =>
		postFuelPhotoConfirm(
			request,
			started.env,
			started.principal,
			started.flags,
			requestId,
		),
	);
}
