import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { ensureActiveOrganization, getAuth } from "~/lib/auth.server";
import { mobileAuthHandoffLinks } from "~/lib/mobile/auth-handoff";
import { readMobilePendingHandoff } from "~/lib/mobile/pending-handoff.server";
import { PKCE_CHALLENGE_REGEX } from "~/lib/mobile/pkce";
import { storeMobileAuthCode } from "~/lib/mobile/token.server";

/** Post-verify handoff for iOS magic-link clients — redirects into the app. */
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
		const pendingId = url.searchParams.get("pending");
		const legacyChallenge = url.searchParams.get("code_challenge");
		let codeChallenge: string | null = null;
		if (pendingId) {
			codeChallenge = await readMobilePendingHandoff(
				context.cloudflare.env.RATION_KV,
				pendingId,
			);
		} else if (legacyChallenge && PKCE_CHALLENGE_REGEX.test(legacyChallenge)) {
			codeChallenge = legacyChallenge;
		}
		if (!codeChallenge) {
			throw redirect("/auth/verify?error=invalid_request");
		}
		const code = await storeMobileAuthCode(
			context.cloudflare.env.RATION_KV,
			activeSession.user.id,
			organizationId,
			codeChallenge,
		);
		const baseUrl = context.cloudflare.env.BETTER_AUTH_URL.replace(/\/$/, "");
		const links = mobileAuthHandoffLinks(baseUrl, code);
		// Chain directly to the Universal Link after verify — the user's Continue
		// tap satisfies the gesture requirement for app handoff.
		throw redirect(links.universalLink);
	}

	throw redirect("/hub");
}

export function meta() {
	return [
		{ title: "Signing in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

/** Loader always redirects; component is a fallback only. */
export default function MobileAuthCallback() {
	return null;
}
