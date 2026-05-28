import { redirect } from "react-router";
import { AuthWidget } from "~/components/auth/AuthWidget";
import { getAuth } from "~/lib/auth.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	const url = new URL(request.url);

	if (session) {
		const next =
			url.searchParams.get("post_login") === "true"
				? "/oauth/select-org"
				: "/oauth/consent";
		const qs = url.searchParams.toString();
		throw redirect(qs ? `${next}?${qs}` : next);
	}

	return { search: url.search };
}

export default function OAuthSignInPage({
	loaderData,
}: {
	loaderData: { search: string };
}) {
	const callbackURL = `/oauth/sign-in${loaderData.search}`;

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md">
				<AuthWidget
					showLogo
					defaultMode="signIn"
					callbackURL={callbackURL}
					intentMessage="Sign in to connect an AI agent to your Ration kitchen."
				/>
				<p className="mt-4 text-center text-sm text-carbon/60">
					After signing in you will choose a household and grant permissions.
				</p>
			</div>
		</div>
	);
}
