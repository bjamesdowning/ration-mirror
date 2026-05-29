import { redirect } from "react-router";
import { AuthWidget } from "~/components/auth/AuthWidget";
import { getAuth } from "~/lib/auth.server";
import {
	advanceFlow,
	ensureFlowForRequest,
	extractOAuthQueryFromRequest,
	OAuthFlowError,
	resolveAuthenticatedEntryPath,
} from "~/lib/oauth-orchestrator.server";
import {
	logOAuthFlowEvent,
	oauthUserMessage,
} from "~/lib/oauth-telemetry.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const env = context.cloudflare.env;
	const url = new URL(request.url);
	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: request.headers });

	try {
		const oauthQuery = extractOAuthQueryFromRequest(url);
		if (!oauthQuery) {
			return { search: url.search, missingOAuth: true };
		}

		const { flow, oauthQuery: query } = await ensureFlowForRequest(
			env.RATION_KV,
			url,
		);

		if (session) {
			await advanceFlow(env.RATION_KV, flow.flowId, "authenticated", {
				userId: session.user.id,
			});
			logOAuthFlowEvent({
				oauthFlowId: flow.flowId,
				step: "authenticated",
				outcome: "success",
				clientId: flow.clientId,
			});

			const next = resolveAuthenticatedEntryPath(flow, query, url.searchParams);
			throw redirect(next);
		}

		const searchParams = new URLSearchParams(url.searchParams);
		searchParams.set("flow_id", flow.flowId);
		searchParams.set("oauth_query", query);

		return { search: `?${searchParams.toString()}`, flowId: flow.flowId };
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		if (error instanceof OAuthFlowError) {
			return {
				search: url.search,
				flowError: oauthUserMessage(error.code),
			};
		}
		throw error;
	}
}

export default function OAuthSignInPage({
	loaderData,
}: {
	loaderData: {
		search: string;
		flowId?: string;
		missingOAuth?: boolean;
		flowError?: string;
	};
}) {
	const callbackURL = `/oauth/sign-in${loaderData.search}`;

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md">
				{loaderData.flowError ? (
					<p className="mb-4 text-sm text-red-600 text-center">
						{loaderData.flowError}
					</p>
				) : null}
				{loaderData.missingOAuth ? (
					<p className="mb-4 text-sm text-red-600 text-center">
						Start the connection from your AI client (paste the MCP URL), not
						this page directly.
					</p>
				) : null}
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
