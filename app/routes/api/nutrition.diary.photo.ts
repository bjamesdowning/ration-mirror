import { postFuelPhoto } from "~/lib/nutrition/diary-http.server";
import type { Route } from "./+types/nutrition.diary.photo";
import { methodNotAllowed, withDiary } from "./nutrition.diary.shared";

/** POST /api/nutrition/diary/photo — queue one Fuel photo. Does not write intake. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	return withDiary({ request, context }, "web", "scan", (started) =>
		postFuelPhoto(request, started.env, started.principal, started.flags),
	);
}

export function loader() {
	methodNotAllowed();
}
