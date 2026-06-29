import { data } from "react-router";
import { requireMobileAuth } from "~/lib/mobile/auth.server";
import { revokeMobileRefreshFamilies } from "~/lib/mobile/token.server";
import type { Route } from "./+types/v1.auth.session";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { userId } = await requireMobileAuth(context, request);
	await revokeMobileRefreshFamilies(context.cloudflare.env, userId);
	return { success: true };
}
