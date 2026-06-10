import { data } from "react-router";
import {
	buildNativeCallbackHandoffHtml,
	decodeNativeCallbackTarget,
	validateNativeCallbackHandoffTarget,
} from "~/lib/oauth-native-handoff.server";

export async function loader({ request }: { request: Request }) {
	const encoded = new URL(request.url).searchParams.get("to");
	const target = validateNativeCallbackHandoffTarget(
		encoded ? decodeNativeCallbackTarget(encoded) : null,
	);

	if (!target) {
		throw data(
			{ error: "Invalid or expired authorization callback." },
			{ status: 400 },
		);
	}

	return new Response(buildNativeCallbackHandoffHtml(target), {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}
