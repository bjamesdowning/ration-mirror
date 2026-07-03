import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { MobileAuthHandoffCard } from "~/components/auth/MobileAuthHandoffCard";
import { parseMobileAuthCodeParam } from "~/lib/mobile/auth-handoff";

/** Universal Link target — renders only when iOS does not intercept the URL. */
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const code = parseMobileAuthCodeParam(url.searchParams.get("code"));
	if (!code) {
		throw redirect("/auth/verify?error=invalid_request");
	}
	return {
		customSchemeLink: `ration://auth/callback?code=${encodeURIComponent(code)}`,
	};
}

export function meta() {
	return [
		{ title: "Signing in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

export default function MobileAuthCallbackOpen() {
	const { customSchemeLink } = useLoaderData<typeof loader>();

	return (
		<MobileAuthHandoffCard
			title="Finish signing in"
			body="If Ration didn't open automatically, tap below. The link expires in about five minutes."
			primaryHref={customSchemeLink}
			footnote="Make sure Ration is installed on this device. If the link still doesn't work, request a new magic link from the app."
		/>
	);
}
