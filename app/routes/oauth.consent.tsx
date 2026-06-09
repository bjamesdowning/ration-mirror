import type { AppLoadContext } from "react-router";
import { Form, redirect } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import {
	OAUTH_MCP_SCOPES,
	OAUTH_SCOPE_LABELS,
	type OAuthMcpScope,
} from "~/lib/oauth.constants";
import { invokeOAuth2Consent } from "~/lib/oauth-auth-api.server";
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
	mapOAuthCallbackError,
} from "~/lib/oauth-redirect.server";
import {
	mapUnknownConsentError,
	oauthErrorResponse,
} from "~/lib/oauth-route-errors.server";
import { logOAuthFlowEvent } from "~/lib/oauth-telemetry.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	await requireAuth(context, request);
	const url = new URL(request.url);
	const signed = getSignedOAuthQuery(url);

	if (!signed) {
		throw redirect(`/oauth/sign-in${url.search}`);
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
		requestedScopes:
			requestedScopes.length > 0 ? requestedScopes : [...OAUTH_MCP_SCOPES],
	};
}

export async function action({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	await requireAuth(context, request);
	const env = context.cloudflare.env;
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

		// Deny and OAuth error redirects (e.g. access_denied) carry no `code=`.
		// Forwarding them to the MCP client makes Cursor/mcp-remote report
		// "No authorization code received", so we stop on the consent page instead.
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
			durationMs: Date.now() - started,
		});
		throw redirect(redirectUrl);
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
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-lg rounded-2xl border border-platinum bg-white p-8 shadow-sm">
				<h1 className="font-mono text-xl font-bold text-carbon mb-2">
					Authorize AI agent
				</h1>
				<p className="text-sm text-carbon/70 mb-6">
					<strong>{loaderData.clientId}</strong> is requesting access to your
					Ration kitchen. You can reduce permissions below.
				</p>

				{actionData?.error && (
					<p className="mb-4 text-sm text-red-600">{actionData.error}</p>
				)}

				{actionData?.errorCode === "flow_invalid" ||
				actionData?.errorCode === "missing_oauth_query" ? (
					<p className="mb-4 text-sm text-carbon/70">
						<a
							href={loaderData.selectOrgHref}
							className="text-hyper-green font-medium underline"
						>
							Restart from household selection
						</a>{" "}
						or remove and re-add the MCP server in your AI client.
					</p>
				) : null}

				<Form method="post" className="space-y-4">
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
								className="flex items-start gap-3 rounded-lg border border-platinum p-3"
							>
								<input
									type="checkbox"
									name="scopes"
									value={scope}
									defaultChecked
									className="mt-1 accent-hyper-green"
								/>
								<span className="text-sm text-carbon">
									{OAUTH_SCOPE_LABELS[scope]}
								</span>
							</label>
						))}
					</fieldset>

					<p className="text-xs text-carbon/50">
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
							className="flex-1 rounded-xl border border-platinum py-3 font-mono text-sm text-carbon"
						>
							Deny
						</button>
					</div>
				</Form>
			</div>
		</div>
	);
}
