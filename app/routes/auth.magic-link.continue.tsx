import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { MobileAuthHandoffCard } from "~/components/auth/MobileAuthHandoffCard";
import { buildMagicLinkVerifyUrl } from "~/lib/magic-link-interstitial.server";

/**
 * Inert landing page for magic-link emails. Security scanners prefetch GET links;
 * this page does not consume the Better Auth token until the user taps Continue.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const verifyUrl = buildMagicLinkVerifyUrl(
		context.cloudflare.env.BETTER_AUTH_URL,
		url.searchParams,
	);
	if (!verifyUrl) {
		throw redirect("/auth/verify?error=INVALID_TOKEN");
	}
	return { verifyUrl };
}

export function meta() {
	return [
		{ title: "Continue sign-in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

export default function MagicLinkContinue() {
	const { verifyUrl } = useLoaderData<typeof loader>();

	return (
		<MobileAuthHandoffCard
			title="Continue to Ration"
			body="Tap below to finish signing in. This step confirms it was you — email security scanners cannot complete it for you."
			primaryHref={verifyUrl}
			primaryLabel="Continue sign-in →"
			footnote="The link expires in 5 minutes. If it fails, request a new magic link from the app or website."
		/>
	);
}
