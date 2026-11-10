import { postFuelPhoto } from "~/lib/nutrition/diary-http.server";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.nutrition.diary.photo";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary({ request, context }, "mobile", "scan", (started) =>
		postFuelPhoto(request, started.env, started.principal, started.flags),
	);
}
