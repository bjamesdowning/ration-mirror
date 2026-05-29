import { redirect } from "react-router";
import { AuthWidget } from "~/components/auth/AuthWidget";
import { getAuth } from "~/lib/auth.server";
import { requiresOAuthOrgSelection } from "~/lib/oauth.server";
import {
	buildOAuthPageUrl,
	getSignedOAuthQuery,
	parseScopesFromSignedQuery,
} from "~/lib/oauth-query.server";
import { oauthUserMessage } from "~/lib/oauth-telemetry.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const env = context.cloudflare.env;
	const url = new URL(request.url);
	const signed = getSignedOAuthQuery(url);

	if (!signed) {
		return { missingOAuth: true as const };
	}

	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (session) {
		const scopes = parseScopesFromSignedQuery(signed);
		const next = requiresOAuthOrgSelection(scopes)
			? buildOAuthPageUrl("/oauth/select-org", signed)
			: buildOAuthPageUrl("/oauth/consent", signed);
		throw redirect(next);
	}

	return {
		callbackURL: buildOAuthPageUrl("/oauth/sign-in", signed),
	};
}

export default function OAuthSignInPage({
	loaderData,
}: {
	loaderData: Awaited<ReturnType<typeof loader>>;
}) {
	if ("missingOAuth" in loaderData && loaderData.missingOAuth) {
		return (
			<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
				<div className="w-full max-w-md">
					<p className="mb-4 text-sm text-red-600 text-center">
						{oauthUserMessage("missing_oauth_query")} Start the connection from
						your AI client (paste the MCP URL), not this page directly.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md">
				<AuthWidget
					showLogo
					defaultMode="signIn"
					callbackURL={loaderData.callbackURL}
					intentMessage="Sign in to connect an AI agent to your Ration kitchen."
				/>
				<p className="mt-4 text-center text-sm text-carbon/60">
					After signing in you will choose a household and grant permissions.
				</p>
			</div>
		</div>
	);
}
