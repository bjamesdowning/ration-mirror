import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { MobileAuthHandoffCard } from "~/components/auth/MobileAuthHandoffCard";
import { ensureActiveOrganization, getAuth } from "~/lib/auth.server";
import { mobileAuthHandoffLinks } from "~/lib/mobile/auth-handoff";
import { readMobilePendingHandoff } from "~/lib/mobile/pending-handoff.server";
import { PKCE_CHALLENGE_REGEX } from "~/lib/mobile/pkce";
import { storeMobileAuthCode } from "~/lib/mobile/token.server";

/** Landing page after magic-link verification for iOS clients. */
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
		return mobileAuthHandoffLinks(baseUrl, code);
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
	const links = useLoaderData<typeof loader>();

	return (
		<MobileAuthHandoffCard
			title="Open Ration to finish signing in"
			body="Your email link was verified. Tap below to return to the app and complete sign-in. The app handoff expires in about five minutes."
			primaryHref={links.universalLink}
			secondaryHref={links.customSchemeLink}
			footnote={
				<>
					Using the Simulator? Open the magic link in{" "}
					<strong className="text-carbon">Safari inside the Simulator</strong>,
					not your Mac&apos;s browser — then tap Open Ration above.
				</>
			}
		/>
	);
}
