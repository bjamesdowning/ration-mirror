import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { data, Form, redirect } from "react-router";
import * as schema from "~/db/schema";
import { getAuth, requireAuth } from "~/lib/auth.server";
import { oauthErrorDetail } from "~/lib/oauth-flow";
import {
	advanceFlow,
	buildConsentUrl,
	ensureFlowForRequest,
	OAuthFlowError,
	requireFlow,
} from "~/lib/oauth-orchestrator.server";
import { getSafeAuthRedirectUrl } from "~/lib/oauth-redirect.server";
import {
	mapUnknownConsentError,
	oauthFlowErrorResponse,
} from "~/lib/oauth-route-errors.server";
import {
	logOAuthFlowEvent,
	oauthUserMessage,
} from "~/lib/oauth-telemetry.server";
import type { OAuthFlowErrorCode } from "~/lib/schemas/oauth-flow";

type MembershipRow = {
	organizationId: string;
	name: string;
	role: string;
};

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
		const { flow, oauthQuery } = await ensureFlowForRequest(env.RATION_KV, url);

		if (flow.step === "initiated") {
			await advanceFlow(env.RATION_KV, flow.flowId, "authenticated", {
				userId: session.user.id,
			});
		} else if (!flow.userId) {
			await advanceFlow(env.RATION_KV, flow.flowId, flow.step, {
				userId: session.user.id,
			});
		}

		await requireFlow(env.RATION_KV, flow.flowId, {
			minStep: "authenticated",
			userId: session.user.id,
		});

		const db = drizzle(env.DB, { schema });
		const memberships = await db
			.select({
				organizationId: schema.organization.id,
				name: schema.organization.name,
				role: schema.member.role,
			})
			.from(schema.member)
			.innerJoin(
				schema.organization,
				eq(schema.member.organizationId, schema.organization.id),
			)
			.where(eq(schema.member.userId, session.user.id));

		return {
			memberships,
			oauthQuery,
			flowId: flow.flowId,
			clientId:
				url.searchParams.get("client_id") ??
				new URLSearchParams(oauthQuery).get("client_id") ??
				"",
		};
	} catch (error) {
		if (error instanceof OAuthFlowError) {
			return {
				memberships: [],
				oauthQuery: url.searchParams.get("oauth_query") ?? "",
				flowId: url.searchParams.get("flow_id") ?? "",
				clientId: url.searchParams.get("client_id") ?? "",
				flowError: oauthUserMessage(error.code),
			};
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
	const organizationId = form.get("organizationId");
	const oauthQuery = form.get("oauth_query");
	const flowId = form.get("flow_id");

	if (typeof organizationId !== "string" || !organizationId) {
		return data(
			{
				error: oauthUserMessage("org_required"),
				errorCode: "org_required" satisfies OAuthFlowErrorCode,
			},
			{ status: 400 },
		);
	}

	if (typeof oauthQuery !== "string" || !oauthQuery) {
		return oauthFlowErrorResponse(new OAuthFlowError("missing_oauth_query"));
	}

	if (typeof flowId !== "string" || !flowId) {
		return oauthFlowErrorResponse(new OAuthFlowError("flow_invalid"));
	}

	const started = Date.now();

	try {
		await requireFlow(env.RATION_KV, flowId, {
			minStep: "authenticated",
			userId: session.user.id,
		});

		const db = drizzle(env.DB, { schema });
		const membership = await db.query.member.findFirst({
			where: (member, { and, eq: eqOp }) =>
				and(
					eqOp(member.userId, session.user.id),
					eqOp(member.organizationId, organizationId),
				),
		});

		if (!membership) {
			return data(
				{
					error: oauthUserMessage("not_member"),
					errorCode: "not_member" satisfies OAuthFlowErrorCode,
				},
				{ status: 403 },
			);
		}

		await db
			.update(schema.session)
			.set({ activeOrganizationId: organizationId })
			.where(eq(schema.session.id, session.session.id));

		await advanceFlow(env.RATION_KV, flowId, "org_selected", {
			organizationId,
		});

		const auth = getAuth(env);
		const continueResult = await auth.api.oauth2Continue({
			headers: request.headers,
			body: {
				postLogin: true,
				oauth_query: oauthQuery,
			},
		});

		const redirectUrl = getSafeAuthRedirectUrl(continueResult);
		if (redirectUrl) {
			await advanceFlow(env.RATION_KV, flowId, "consent_presented");
			logOAuthFlowEvent({
				oauthFlowId: flowId,
				step: "org_selected",
				outcome: "success",
				clientId: new URLSearchParams(oauthQuery).get("client_id") ?? undefined,
				durationMs: Date.now() - started,
			});
			throw redirect(redirectUrl);
		}

		await advanceFlow(env.RATION_KV, flowId, "consent_presented");
		logOAuthFlowEvent({
			oauthFlowId: flowId,
			step: "org_selected",
			outcome: "success",
			clientId: new URLSearchParams(oauthQuery).get("client_id") ?? undefined,
			durationMs: Date.now() - started,
		});
		throw redirect(buildConsentUrl(flowId, oauthQuery));
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		if (error instanceof OAuthFlowError) {
			return oauthFlowErrorResponse(error, flowId);
		}
		logOAuthFlowEvent({
			oauthFlowId: flowId,
			step: "org_selected",
			outcome: "error",
			errorCode: "consent_rejected",
			detail: oauthErrorDetail(error),
			durationMs: Date.now() - started,
		});
		return mapUnknownConsentError(error, {
			flowId,
			clientId: new URLSearchParams(oauthQuery).get("client_id") ?? undefined,
		});
	}
}

export default function OAuthSelectOrgPage({
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
					Select household
				</h1>
				<p className="text-sm text-carbon/70 mb-6">
					Choose which Ration group this AI agent may access. One grant applies
					to a single household.
				</p>

				{(loaderData.flowError || actionData?.error) && (
					<p className="mb-4 text-sm text-red-600">
						{loaderData.flowError ?? actionData?.error}
					</p>
				)}

				<Form method="post" className="space-y-3">
					<input
						type="hidden"
						name="oauth_query"
						value={loaderData.oauthQuery}
					/>
					<input type="hidden" name="flow_id" value={loaderData.flowId} />
					{loaderData.memberships.map((m: MembershipRow) => (
						<label
							key={m.organizationId}
							className="flex cursor-pointer items-center gap-3 rounded-xl border border-platinum p-4 hover:border-hyper-green/50"
						>
							<input
								type="radio"
								name="organizationId"
								value={m.organizationId}
								required
								className="accent-hyper-green"
							/>
							<span>
								<span className="block font-medium text-carbon">{m.name}</span>
								<span className="text-xs text-carbon/50 capitalize">
									{m.role}
								</span>
							</span>
						</label>
					))}

					<button
						type="submit"
						className="mt-4 w-full rounded-xl bg-hyper-green py-3 font-mono text-sm font-bold text-carbon"
					>
						Continue
					</button>
				</Form>
			</div>
		</div>
	);
}
