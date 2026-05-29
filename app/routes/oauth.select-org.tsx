import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { data, Form, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import {
	invokeOAuth2ContinuePostLogin,
	setActiveOrganizationViaHandler,
} from "~/lib/oauth-auth-api.server";
import {
	buildOAuthPageUrl,
	decodeOAuthQueryFromForm,
	encodeOAuthQueryForForm,
	getSignedOAuthQuery,
} from "~/lib/oauth-query.server";
import { getSafeAuthRedirectUrl } from "~/lib/oauth-redirect.server";
import {
	mapUnknownConsentError,
	oauthErrorResponse,
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
	const signed = getSignedOAuthQuery(url);

	if (!signed) {
		return {
			memberships: [] as MembershipRow[],
			oauthQueryB64: "",
			clientId: "",
			flowError: oauthUserMessage("missing_oauth_query"),
		};
	}

	if (!url.searchParams.has("oauth_query")) {
		throw redirect(buildOAuthPageUrl("/oauth/select-org", signed));
	}

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
		oauthQueryB64: encodeOAuthQueryForForm(signed),
		clientId:
			url.searchParams.get("client_id") ??
			new URLSearchParams(signed).get("client_id") ??
			"",
	};
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
	const oauthQueryB64 = form.get("oauth_query_b64");
	const oauthQuery =
		typeof oauthQueryB64 === "string"
			? decodeOAuthQueryFromForm(oauthQueryB64)
			: null;

	if (typeof organizationId !== "string" || !organizationId) {
		return data(
			{
				error: oauthUserMessage("org_required"),
				errorCode: "org_required" satisfies OAuthFlowErrorCode,
			},
			{ status: 400 },
		);
	}

	if (!oauthQuery) {
		return oauthErrorResponse("missing_oauth_query", { step: "select_org" });
	}

	if (!new URLSearchParams(oauthQuery).get("sig")) {
		return oauthErrorResponse("flow_invalid", { step: "select_org" });
	}

	const started = Date.now();
	const clientId =
		new URLSearchParams(oauthQuery).get("client_id") ?? undefined;

	try {
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

		const headersWithSession = await setActiveOrganizationViaHandler(
			env,
			request,
			organizationId,
		);

		const continueResult = await invokeOAuth2ContinuePostLogin(
			env,
			request,
			oauthQuery,
			{ headers: headersWithSession },
		);

		const redirectUrl = getSafeAuthRedirectUrl(continueResult);
		if (!redirectUrl) {
			return oauthErrorResponse("redirect_missing", {
				step: "select_org",
				clientId,
			});
		}

		logOAuthFlowEvent({
			step: "select_org",
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
			step: "select_org",
			clientId,
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
						name="oauth_query_b64"
						value={loaderData.oauthQueryB64}
					/>
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
