import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { ensureActiveOrganization, getAuth } from "~/lib/auth.server";
import { storeMobileAuthCode } from "~/lib/mobile/token.server";

/**
 * Landing page after magic-link verification for iOS clients.
 * Web magic links continue to use /auth/verify — this path is only used when
 * `callbackURL` includes `client=ios` from the mobile API.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const error = url.searchParams.get("error");
	if (error) {
		throw redirect(`/auth/verify?error=${encodeURIComponent(error)}`);
	}

	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw redirect("/");
	}

	const { session: activeSession } = await ensureActiveOrganization(
		context.cloudflare.env,
		session,
	);
	const organizationId = activeSession.session.activeOrganizationId;
	if (!organizationId) {
		throw redirect("/select-group");
	}

	const client = url.searchParams.get("client");
	if (client === "ios") {
		const code = await storeMobileAuthCode(
			context.cloudflare.env.RATION_KV,
			activeSession.user.id,
			organizationId,
		);
		throw redirect(`ration://auth/callback?code=${encodeURIComponent(code)}`);
	}

	throw redirect("/hub");
}

export function meta() {
	return [
		{ title: "Signing in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

export default function MobileAuthCallback() {
	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<p className="text-sm text-muted">Completing sign-in…</p>
		</div>
	);
}
