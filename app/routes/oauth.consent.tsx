import type { AppLoadContext } from "react-router";
import { Form, redirect } from "react-router";
import { OAuthCard } from "~/components/oauth/OAuthCard";
import { getSessionForOAuthFlow } from "~/lib/auth.server";
import {
	OAUTH_CONSENT_DEFAULT_CHECKED_SCOPES,
	OAUTH_MCP_SCOPES,
	OAUTH_SCOPE_LABELS,
	type OAuthMcpScope,
} from "~/lib/oauth.constants";
import { invokeOAuth2Consent } from "~/lib/oauth-auth-api.server";
import {
	clearOAuthCorrelationCookie,
	getOAuthCorrelationId,
} from "~/lib/oauth-correlation.server";
import { buildNativeCallbackHandoffPath } from "~/lib/oauth-native-handoff.server";
import {
	buildConsentScopeForSubmit,
	buildOAuthPageUrl,
	decodeOAuthQueryFromForm,
	encodeOAuthQueryForForm,
	getSignedOAuthQuery,
	parseScopesFromSignedQuery,
} from "~/lib/oauth-query.server";
import {
	classifyOAuthClientRedirect,
	getSafeAuthRedirectUrl,
	isNativeMcpClientRedirectUrl,
	mapOAuthCallbackError,
} from "~/lib/oauth-redirect.server";
import {
	mapUnknownConsentError,
	oauthErrorResponse,
} from "~/lib/oauth-route-errors.server";
import { logOAuthFlowEvent } from "~/lib/oauth-telemetry.server";

const DEFAULT_CHECKED = new Set<string>(OAUTH_CONSENT_DEFAULT_CHECKED_SCOPES);

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const url = new URL(request.url);
	const signed = getSignedOAuthQuery(url);

	if (!signed) {
		throw redirect(`/oauth/sign-in${url.search}`);
	}

	const session = await getSessionForOAuthFlow(context, request);
	if (!session) {
		throw redirect(buildOAuthPageUrl("/oauth/sign-in", signed));
	}

	if (!url.searchParams.has("oauth_query")) {
		throw redirect(buildOAuthPageUrl("/oauth/consent", signed));
	}

	const scopeParam =
		url.searchParams.get("scope") ??
		parseScopesFromSignedQuery(signed).join(" ");
	const requestedScopes = scopeParam
		.split(/\s+/)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	const clientId =
		url.searchParams.get("client_id") ??
		new URLSearchParams(signed).get("client_id") ??
		"Unknown client";

	return {
		clientId,
		oauthQueryB64: encodeOAuthQueryForForm(signed),
		selectOrgHref: buildOAuthPageUrl("/oauth/select-org", signed),
		requestedScopes,
		hasRequestedScopes: requestedScopes.length > 0,
		correlationId: getOAuthCorrelationId(request),
	};
}

export async function action({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const session = await getSessionForOAuthFlow(context, request);
	const env = context.cloudflare.env;
	const correlationId = getOAuthCorrelationId(request);

	if (!session) {
		return oauthErrorResponse("flow_invalid", { step: "consent" });
	}

	const form = await request.formData();
	const accept = form.get("accept") === "true";
	const oauthQueryB64 = form.get("oauth_query_b64");
	const oauthQuery =
		typeof oauthQueryB64 === "string"
			? decodeOAuthQueryFromForm(oauthQueryB64)
			: null;
	const selectedScopes = form
		.getAll("scopes")
		.map(String)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	if (!oauthQuery) {
		return oauthErrorResponse("missing_oauth_query", { step: "consent" });
	}

	if (!new URLSearchParams(oauthQuery).get("sig")) {
		return oauthErrorResponse("flow_invalid", { step: "consent" });
	}

	const started = Date.now();
	const clientId =
		new URLSearchParams(oauthQuery).get("client_id") ?? undefined;

	try {
		const result = await invokeOAuth2Consent(env, request, {
			accept,
			oauth_query: oauthQuery,
			...(accept
				? { scope: buildConsentScopeForSubmit(selectedScopes, oauthQuery) }
				: {}),
		});

		const redirectUrl = getSafeAuthRedirectUrl(result);
		if (!redirectUrl) {
			return oauthErrorResponse("redirect_missing", {
				step: "consent",
				clientId,
			});
		}

		const classification = classifyOAuthClientRedirect(redirectUrl);

		if (!accept) {
			return oauthErrorResponse("consent_rejected", {
				step: "consent",
				clientId,
			});
		}

		if (classification.kind === "error") {
			return oauthErrorResponse(mapOAuthCallbackError(classification.error), {
				step: "consent",
				clientId,
			});
		}

		if (classification.kind !== "code" && classification.kind !== "internal") {
			return oauthErrorResponse("redirect_missing", {
				step: "consent",
				clientId,
			});
		}

		logOAuthFlowEvent({
			step: "consent",
			outcome: "success",
			clientId,
			correlationId,
			durationMs: Date.now() - started,
		});
		const redirectHeaders = new Headers();
		clearOAuthCorrelationCookie(redirectHeaders, request);
		const destination = isNativeMcpClientRedirectUrl(redirectUrl)
			? buildNativeCallbackHandoffPath(redirectUrl)
			: redirectUrl;
		throw redirect(destination, { headers: redirectHeaders });
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		return mapUnknownConsentError(error, {
			step: "consent",
			clientId,
		});
	}
}

export default function OAuthConsentPage({
	loaderData,
	actionData,
}: {
	loaderData: Awaited<ReturnType<typeof loader>>;
	actionData?: { error?: string; errorCode?: string };
}) {
	return (
		<OAuthCard
			title="Authorize AI agent"
			description={
				<>
					<strong>{loaderData.clientId}</strong> is requesting access to your
					Ration kitchen. Read access is enabled by default; you may add write
					permissions below.
				</>
			}
			error={actionData?.error}
		>
			{actionData?.errorCode === "flow_invalid" ||
			actionData?.errorCode === "missing_oauth_query" ? (
				<p className="mb-4 text-sm text-muted">
					<a
						href={loaderData.selectOrgHref}
						className="text-hyper-green font-medium underline"
					>
						Restart from household selection
					</a>{" "}
					or remove and re-add the MCP server in your AI client.
				</p>
			) : null}

			{!loaderData.hasRequestedScopes ? (
				<p className="text-sm text-muted">
					This authorization request did not include MCP permissions. Restart
					the connection from your AI client.
				</p>
			) : (
				<Form method="post" reloadDocument className="space-y-4">
					<input
						type="hidden"
						name="oauth_query_b64"
						value={loaderData.oauthQueryB64}
					/>
					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-carbon mb-2">
							Permissions
						</legend>
						{loaderData.requestedScopes.map((scope: OAuthMcpScope) => (
							<label
								key={scope}
								className="flex items-start gap-3 rounded-lg border border-platinum/50 p-3"
							>
								<input
									type="checkbox"
									name="scopes"
									value={scope}
									defaultChecked={DEFAULT_CHECKED.has(scope)}
									className="mt-1 accent-hyper-green"
								/>
								<span className="text-sm text-carbon">
									{OAUTH_SCOPE_LABELS[scope]}
								</span>
							</label>
						))}
					</fieldset>

					<p className="text-xs text-muted">
						By authorizing, you allow this agent to act on your behalf within
						the selected permissions. Revoke access anytime in Hub Settings →
						Connected Agents.
					</p>

					<div className="flex gap-3 pt-2">
						<button
							type="submit"
							name="accept"
							value="true"
							className="flex-1 rounded-xl bg-hyper-green py-3 font-mono text-sm font-bold text-carbon"
						>
							Authorize
						</button>
						<button
							type="submit"
							name="accept"
							value="false"
							className="flex-1 rounded-xl border border-platinum/50 py-3 font-mono text-sm text-carbon"
						>
							Deny
						</button>
					</div>
				</Form>
			)}
		</OAuthCard>
	);
}
