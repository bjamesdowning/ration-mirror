import { redirect } from "react-router";
import { AuthWidget } from "~/components/auth/AuthWidget";
import { OAuthCard } from "~/components/oauth/OAuthCard";
import { getAuth } from "~/lib/auth.server";
import { resumeOAuthAuthorizeAfterSession } from "~/lib/oauth-auth-api.server";
import {
	buildOAuthPageUrl,
	getSignedOAuthQuery,
} from "~/lib/oauth-query.server";
import { mapBetterAuthConsentError } from "~/lib/oauth-route-errors.server";

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
		try {
			const next = await resumeOAuthAuthorizeAfterSession(env, request, signed);
			throw redirect(next);
		} catch (error) {
			if (error instanceof Response) {
				throw error;
			}
			const mapped = mapBetterAuthConsentError(error);
			return {
				callbackURL: buildOAuthPageUrl("/oauth/sign-in", signed),
				flowError: mapped.error,
			};
		}
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
			<OAuthCard
				maxWidth="md"
				title="Connect AI agent"
				error="Missing authorization session. Start the connection from your AI client (paste the MCP URL), not this page directly."
			/>
		);
	}

	return (
		<OAuthCard
			maxWidth="md"
			title="Connect AI agent"
			error={"flowError" in loaderData ? loaderData.flowError : undefined}
		>
			<AuthWidget
				showLogo
				defaultMode="signIn"
				callbackURL={loaderData.callbackURL}
				intentMessage="Sign in to connect an AI agent to your Ration kitchen."
			/>
			<p className="mt-4 text-center text-sm text-muted">
				After signing in you will choose a household and grant permissions.
			</p>
		</OAuthCard>
	);
}
