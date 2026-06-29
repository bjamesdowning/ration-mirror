import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { ensureActiveOrganization, getAuth } from "~/lib/auth.server";
import { PKCE_CHALLENGE_REGEX } from "~/lib/mobile/pkce";
import { storeMobileAuthCode } from "~/lib/mobile/token.server";

/**
 * Landing page after magic-link verification for iOS clients.
 * Web magic links continue to use /auth/verify — this path is only used when
 * `callbackURL` includes `client=ios` from the mobile API.
 *
 * Returns a visible "Open Ration" page instead of an immediate server redirect
 * to `ration://` — Safari (especially in Simulator) often shows a blank screen
 * when custom-scheme redirects fail silently.
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
		// PKCE is mandatory for the iOS flow — without a bound challenge the
		// one-time code would be redeemable by any app that intercepts the handoff.
		const codeChallenge = url.searchParams.get("code_challenge");
		if (!codeChallenge || !PKCE_CHALLENGE_REGEX.test(codeChallenge)) {
			throw redirect("/auth/verify?error=invalid_request");
		}
		const code = await storeMobileAuthCode(
			context.cloudflare.env.RATION_KV,
			activeSession.user.id,
			organizationId,
			codeChallenge,
		);
		const baseUrl = context.cloudflare.env.BETTER_AUTH_URL.replace(/\/$/, "");
		const encoded = encodeURIComponent(code);
		return {
			// Primary handoff: a verified-domain Universal Link. A user tap on this
			// https link opens the app directly (Associated Domains); custom-scheme
			// is only the fallback when Universal Links don't fire.
			universalLink: `${baseUrl}/auth/mobile-callback/open?code=${encoded}`,
			customSchemeLink: `ration://auth/callback?code=${encoded}`,
		};
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
	const { universalLink, customSchemeLink } = useLoaderData<typeof loader>();

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-xl text-center">
				<h1 className="text-display text-xl text-carbon mb-3">
					Open Ration to finish signing in
				</h1>
				<p className="text-sm text-muted mb-6 leading-relaxed">
					Your email link was verified. Tap below to return to the app and
					complete sign-in. The link expires in about one minute.
				</p>
				<a
					href={universalLink}
					className="inline-flex items-center justify-center gap-2 w-full bg-hyper-green text-carbon font-bold py-3 px-6 rounded-xl hover:shadow-glow-sm transition-all focus-ring"
				>
					Open Ration
				</a>
				<a
					href={customSchemeLink}
					className="inline-flex items-center justify-center gap-2 w-full mt-3 text-sm text-muted underline focus-ring"
				>
					Having trouble? Open with the app link instead
				</a>
				<p className="text-xs text-muted mt-4 leading-relaxed">
					Using the Simulator? Open the magic link in{" "}
					<strong className="text-carbon">Safari inside the Simulator</strong>,
					not your Mac&apos;s browser — then tap Open Ration above.
				</p>
			</div>
		</div>
	);
}
