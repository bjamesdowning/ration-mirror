import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { Form, redirect } from "react-router";
import * as schema from "~/db/schema";
import { getAuth, requireAuth } from "~/lib/auth.server";
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
import {
	advanceFlow,
	deleteFlow,
	ensureFlowForRequest,
	OAuthFlowError,
	requireFlow,
	syncOrgSelectionForConsent,
	verifyOAuthQueryDigestAsync,
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
	const session = await requireAuth(context, request);
	const env = context.cloudflare.env;
	const url = new URL(request.url);

	try {
		const { flow: initialFlow, oauthQuery } = await ensureFlowForRequest(
			env.RATION_KV,
			url,
		);
		const db = drizzle(env.DB, { schema });
		const flow = await syncOrgSelectionForConsent(env.RATION_KV, {
			flow: initialFlow,
			oauthQuery,
			userId: session.user.id,
			activeOrganizationId: session.session.activeOrganizationId,
			isMemberOfOrg: async (userId, organizationId) => {
				const membership = await db.query.member.findFirst({
					where: (member, { and, eq: eqOp }) =>
						and(
							eqOp(member.userId, userId),
							eqOp(member.organizationId, organizationId),
						),
				});
				return membership !== undefined;
			},
		});

		await requireFlow(env.RATION_KV, flow.flowId, {
			minStep: "org_selected",
			userId: session.user.id,
		});

		const digestOk = await verifyOAuthQueryDigestAsync(
			oauthQuery,
			flow.oauthQueryDigest,
		);
		if (!digestOk) {
			throw new OAuthFlowError("flow_invalid");
		}

		if (flow.step !== "consent_presented") {
			await advanceFlow(env.RATION_KV, flow.flowId, "consent_presented", {
				userId: session.user.id,
			});
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
			flowId: flow.flowId,
			requestedScopes:
				requestedScopes.length > 0 ? requestedScopes : [...OAUTH_MCP_SCOPES],
		};
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		if (error instanceof OAuthFlowError) {
			const flowId = url.searchParams.get("flow_id") ?? undefined;
			if (error.code === "flow_step_mismatch") {
				throw oauthFlowErrorResponse(
					new OAuthFlowError(
						"org_required",
						"Select a household before authorizing.",
					),
					flowId,
				);
			}
			throw oauthFlowErrorResponse(error, flowId);
		}
		throw error;
	}
}

export async function action({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const session = await requireAuth(context, request);
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

	if (typeof flowId !== "string" || !flowId) {
		return oauthFlowErrorResponse(new OAuthFlowError("flow_invalid"));
	}

	const started = Date.now();
	const clientId =
		new URLSearchParams(oauthQuery).get("client_id") ?? undefined;

	try {
		const flow = await requireFlow(env.RATION_KV, flowId, {
			minStep: "org_selected",
			userId: session.user.id,
		});

		const digestOk = await verifyOAuthQueryDigestAsync(
			oauthQuery,
			flow.oauthQueryDigest,
		);
		if (!digestOk) {
			throw new OAuthFlowError("flow_invalid");
		}

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

		await advanceFlow(env.RATION_KV, flowId, "completed");
		await deleteFlow(env.RATION_KV, flowId);
		logOAuthFlowEvent({
			oauthFlowId: flowId,
			step: "completed",
			outcome: "success",
			clientId,
			durationMs: Date.now() - started,
		});
		throw redirect(redirectUrl);
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		if (error instanceof OAuthFlowError) {
			return oauthFlowErrorResponse(error, flowId);
		}
		logOAuthFlowEvent({
			oauthFlowId: flowId,
			step: "consent_presented",
			outcome: "error",
			errorCode: "consent_rejected",
			clientId,
			detail: oauthErrorDetail(error),
			durationMs: Date.now() - started,
		});
		return mapUnknownConsentError(error, { flowId, clientId });
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

				{actionData?.errorCode === "org_required" && (
					<p className="mb-4 text-sm text-carbon/70">
						<a
							href={`/oauth/select-org?flow_id=${loaderData.flowId}&oauth_query=${encodeURIComponent(loaderData.oauthQuery)}`}
							className="text-hyper-green font-medium underline"
						>
							Select a household
						</a>{" "}
						first, then return here.
					</p>
				)}

				<Form method="post" className="space-y-4">
					<input
						type="hidden"
						name="oauth_query"
						value={loaderData.oauthQuery}
					/>
					<input type="hidden" name="flow_id" value={loaderData.flowId} />
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
