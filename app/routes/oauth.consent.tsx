import type { AppLoadContext } from "react-router";
import { data, Form, redirect } from "react-router";
import { getAuth, requireAuth } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import {
	OAUTH_MCP_SCOPES,
	OAUTH_SCOPE_LABELS,
	type OAuthMcpScope,
} from "~/lib/oauth.constants";
import {
	buildConsentScopeForSubmit,
	oauthErrorDetail,
	parseScopesFromOAuthQuery,
} from "~/lib/oauth-flow";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	await requireAuth(context, request);
	const url = new URL(request.url);
	const clientId = url.searchParams.get("client_id") ?? "Unknown client";
	const oauthQuery =
		url.searchParams.get("oauth_query") ?? url.search.replace(/^\?/, "");
	const oauthQueryFromUrl =
		url.searchParams.get("oauth_query") ?? url.search.replace(/^\?/, "");
	const scopeParam =
		url.searchParams.get("scope") ??
		parseScopesFromOAuthQuery(oauthQueryFromUrl).join(" ");
	const requestedScopes = scopeParam
		.split(/\s+/)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	return {
		clientId,
		oauthQuery,
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
	const form = await request.formData();
	const accept = form.get("accept") === "true";
	const oauthQuery = form.get("oauth_query");
	const selectedScopes = form
		.getAll("scopes")
		.map(String)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	if (typeof oauthQuery !== "string" || !oauthQuery) {
		return data({ error: "Missing consent session." }, { status: 400 });
	}

	const auth = getAuth(context.cloudflare.env);
	const consentScope =
		accept && typeof oauthQuery === "string"
			? buildConsentScopeForSubmit(selectedScopes, oauthQuery)
			: undefined;

	let result: Awaited<ReturnType<typeof auth.api.oauth2Consent>>;
	try {
		result = await auth.api.oauth2Consent({
			headers: request.headers,
			body: {
				accept,
				oauth_query: oauthQuery,
				...(accept && consentScope ? { scope: consentScope } : {}),
			},
		});
	} catch (error) {
		// Better Auth throws an APIError when the signed consent session is
		// invalid or expired (`codeExpiresIn`, default 10 min). Surface a clear,
		// non-fatal message instead of crashing into the generic error page.
		log.error("OAuth consent submission failed", error, {
			clientId: redactId(new URLSearchParams(oauthQuery).get("client_id")),
			detail: oauthErrorDetail(error),
			consentScope: consentScope ? redactId(consentScope) : undefined,
		});
		return data(
			{
				error:
					"This authorization request could not be completed — it may have expired. Please restart the connection from your AI client and try again.",
			},
			{ status: 400 },
		);
	}

	if (
		result &&
		typeof result === "object" &&
		"redirect" in result &&
		result.redirect &&
		"url" in result &&
		typeof result.url === "string"
	) {
		throw redirect(result.url);
	}

	if (
		result &&
		typeof result === "object" &&
		"redirect_uri" in result &&
		typeof result.redirect_uri === "string"
	) {
		throw redirect(result.redirect_uri);
	}

	return data({ error: "Unable to complete authorization." }, { status: 500 });
}

export default function OAuthConsentPage({
	loaderData,
	actionData,
}: {
	loaderData: Awaited<ReturnType<typeof loader>>;
	actionData?: { error?: string };
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

				<Form method="post" className="space-y-4">
					<input
						type="hidden"
						name="oauth_query"
						value={loaderData.oauthQuery}
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
