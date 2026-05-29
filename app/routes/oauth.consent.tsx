import type { AppLoadContext } from "react-router";
import { Form, redirect } from "react-router";
import { getAuth, requireAuth } from "~/lib/auth.server";
import {
	OAUTH_MCP_SCOPES,
	OAUTH_SCOPE_LABELS,
	type OAuthMcpScope,
} from "~/lib/oauth.constants";
import { requiresOAuthOrgSelection } from "~/lib/oauth.server";
import {
	buildConsentScopeForSubmit,
	oauthErrorDetail,
	parseScopesFromOAuthQuery,
} from "~/lib/oauth-flow";
import {
	advanceFlow,
	buildSelectOrgUrl,
	createFlow,
	extractOAuthQueryFromRequest,
	OAUTH_HOUSEHOLD_SELECTED_PARAM,
	OAuthFlowError,
} from "~/lib/oauth-orchestrator.server";
import { getSafeAuthRedirectUrl } from "~/lib/oauth-redirect.server";
import {
	mapUnknownConsentError,
	oauthFlowErrorResponse,
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
	const env = context.cloudflare.env;
	const url = new URL(request.url);

	const oauthQuery = extractOAuthQueryFromRequest(url);
	if (!oauthQuery) {
		throw redirect(`/oauth/sign-in${url.search}`);
	}

	const scopes = parseScopesFromOAuthQuery(oauthQuery);
	if (
		requiresOAuthOrgSelection(scopes) &&
		url.searchParams.get(OAUTH_HOUSEHOLD_SELECTED_PARAM) !== "1"
	) {
		let flowId = url.searchParams.get("flow_id");
		if (!flowId) {
			const flow = await createFlow(env.RATION_KV, oauthQuery);
			flowId = flow.flowId;
		}
		throw redirect(buildSelectOrgUrl(flowId, oauthQuery));
	}

	const flowId = url.searchParams.get("flow_id");
	if (flowId) {
		try {
			await advanceFlow(env.RATION_KV, flowId, "consent_presented");
		} catch {
			// Telemetry only — Better Auth owns authorization state.
		}
	}

	const scopeParam =
		url.searchParams.get("scope") ??
		parseScopesFromOAuthQuery(oauthQuery).join(" ");
	const requestedScopes = scopeParam
		.split(/\s+/)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	const clientId =
		url.searchParams.get("client_id") ??
		new URLSearchParams(oauthQuery).get("client_id") ??
		"Unknown client";

	return {
		clientId,
		oauthQuery,
		flowId: flowId ?? "",
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
	const oauthQuery = form.get("oauth_query");
	const flowId = form.get("flow_id");
	const selectedScopes = form
		.getAll("scopes")
		.map(String)
		.filter((s): s is OAuthMcpScope =>
			(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
		);

	if (typeof oauthQuery !== "string" || !oauthQuery) {
		return oauthFlowErrorResponse(new OAuthFlowError("missing_oauth_query"));
	}

	const started = Date.now();
	const clientId =
		new URLSearchParams(oauthQuery).get("client_id") ?? undefined;
	const telemetryFlowId =
		typeof flowId === "string" && flowId.length > 0 ? flowId : undefined;

	try {
		const auth = getAuth(env);
		const consentScope =
			accept && typeof oauthQuery === "string"
				? buildConsentScopeForSubmit(selectedScopes, oauthQuery)
				: undefined;

		const result = await auth.api.oauth2Consent({
			headers: request.headers,
			body: {
				accept,
				oauth_query: oauthQuery,
				...(accept && consentScope ? { scope: consentScope } : {}),
			},
		});

		const redirectUrl = getSafeAuthRedirectUrl(result);
		if (!redirectUrl) {
			throw new OAuthFlowError("redirect_missing");
		}

		if (telemetryFlowId) {
			try {
				await advanceFlow(env.RATION_KV, telemetryFlowId, "completed");
			} catch {
				// Telemetry only
			}
			logOAuthFlowEvent({
				oauthFlowId: telemetryFlowId,
				step: "completed",
				outcome: "success",
				clientId,
				durationMs: Date.now() - started,
			});
		}

		throw redirect(redirectUrl);
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		if (error instanceof OAuthFlowError) {
			return oauthFlowErrorResponse(error, telemetryFlowId);
		}
		logOAuthFlowEvent({
			oauthFlowId: telemetryFlowId ?? "unknown",
			step: "consent_presented",
			outcome: "error",
			errorCode: "consent_rejected",
			clientId,
			detail: oauthErrorDetail(error),
			durationMs: Date.now() - started,
		});
		return mapUnknownConsentError(error, {
			flowId: telemetryFlowId,
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
	const selectOrgHref =
		loaderData.flowId.length > 0
			? `/oauth/select-org?flow_id=${loaderData.flowId}&oauth_query=${encodeURIComponent(loaderData.oauthQuery)}`
			: `/oauth/select-org?oauth_query=${encodeURIComponent(loaderData.oauthQuery)}`;

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
							href={selectOrgHref}
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
						name="oauth_query"
						value={loaderData.oauthQuery}
					/>
					{loaderData.flowId ? (
						<input type="hidden" name="flow_id" value={loaderData.flowId} />
					) : null}
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
