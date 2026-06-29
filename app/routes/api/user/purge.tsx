import { data, redirect } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { purgeUserAccount } from "~/lib/user-purge.server";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"user_purge",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Account deletion is rate limited. Please try again later." },
			{ status: 429, headers: { "Retry-After": "300" } },
		);
	}

	try {
		await purgeUserAccount(context.cloudflare.env, {
			userId,
			email: user.email,
		});
	} catch (_error) {
		throw data(
			{
				error:
					"Account deletion failed. Please try again later or contact support.",
			},
			{ status: 500 },
		);
	}

	return redirect("/");
}
