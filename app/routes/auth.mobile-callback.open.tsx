import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Universal Link target for the iOS auth handoff.
 *
 * When Associated Domains are active and the app is installed, a tap on this
 * https URL is intercepted by iOS and the app opens directly — Safari never
 * loads this route. This server page only renders as a *fallback* when Universal
 * Links don't fire (app not installed, AASA not yet cached, or links disabled),
 * offering the custom-scheme handoff so sign-in can still complete.
 *
 * No new code is minted here; the single-use, PKCE-bound, ~60s code from
 * `/auth/mobile-callback` is passed through and validated as a UUID before being
 * reflected into the custom-scheme link.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	if (!code || !UUID_REGEX.test(code)) {
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
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-xl text-center">
				<h1 className="text-display text-xl text-carbon mb-3">
					Finish signing in
				</h1>
				<p className="text-sm text-muted mb-6 leading-relaxed">
					If Ration didn&apos;t open automatically, tap below. The link expires
					in about one minute.
				</p>
				<a
					href={customSchemeLink}
					className="inline-flex items-center justify-center gap-2 w-full bg-hyper-green text-carbon font-bold py-3 px-6 rounded-xl hover:shadow-glow-sm transition-all focus-ring"
				>
					Open Ration
				</a>
				<p className="text-xs text-muted mt-4 leading-relaxed">
					Make sure Ration is installed on this device. If the link still
					doesn&apos;t work, request a new magic link from the app.
				</p>
			</div>
		</div>
	);
}
