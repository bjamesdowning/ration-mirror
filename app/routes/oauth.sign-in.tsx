import { redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { AuthWidget } from "~/components/auth/AuthWidget";
import { OAuthCard } from "~/components/oauth/OAuthCard";
import { getSessionForOAuthFlow } from "~/lib/auth.server";
import { buildOAuthAuthorizeResumeUrl } from "~/lib/oauth-auth-http.server";
import {
	appendOAuthCorrelationCookie,
	getOAuthCorrelationId,
} from "~/lib/oauth-correlation.server";
import {
	buildOAuthPageUrl,
	getSignedOAuthQuery,
} from "~/lib/oauth-query.server";
import { logOAuthFlowEvent } from "~/lib/oauth-telemetry.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const url = new URL(request.url);
	const signed = getSignedOAuthQuery(url);
	const correlationId = getOAuthCorrelationId(request);

	if (!signed) {
		return { missingOAuth: true as const };
	}

	const session = await getSessionForOAuthFlow(context, request);

	if (session) {
		logOAuthFlowEvent({
			step: "sign_in",
			outcome: "success",
			correlationId,
			durationMs: 0,
		});
		const resumeUrl = buildOAuthAuthorizeResumeUrl(request, signed);
		const headers = new Headers();
		appendOAuthCorrelationCookie(headers, request, correlationId);
		throw redirect(resumeUrl, { headers });
	}

	return {
		callbackURL: buildOAuthPageUrl("/oauth/sign-in", signed),
		correlationId,
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
		<OAuthCard maxWidth="md" title="Connect AI agent">
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
