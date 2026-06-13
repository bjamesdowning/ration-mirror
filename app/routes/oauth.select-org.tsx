import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { data, Form, redirect } from "react-router";
import { OAuthCard } from "~/components/oauth/OAuthCard";
import * as schema from "~/db/schema";
import { getSessionForOAuthFlow } from "~/lib/auth.server";
import {
	invokeOAuth2ContinuePostLogin,
	setActiveOrganizationViaHandler,
} from "~/lib/oauth-auth-api.server";
import {
	appendOAuthCorrelationCookie,
	getOAuthCorrelationId,
} from "~/lib/oauth-correlation.server";
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
	const env = context.cloudflare.env;
	const url = new URL(request.url);
	const signed = getSignedOAuthQuery(url);
	const correlationId = getOAuthCorrelationId(request);

	if (!signed) {
		return {
			memberships: [] as MembershipRow[],
			oauthQueryB64: "",
			clientId: "",
			flowError: oauthUserMessage("missing_oauth_query"),
		};
	}

	const session = await getSessionForOAuthFlow(context, request);
	if (!session) {
		throw redirect(buildOAuthPageUrl("/oauth/sign-in", signed));
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
		correlationId,
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
		return oauthErrorResponse("flow_invalid", {
			step: "select_org",
			correlationId,
		});
	}

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
		return oauthErrorResponse("missing_oauth_query", {
			step: "select_org",
			correlationId,
		});
	}

	if (!new URLSearchParams(oauthQuery).get("sig")) {
		return oauthErrorResponse("flow_invalid", {
			step: "select_org",
			correlationId,
		});
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

		const { headers: headersWithSession, setCookieHeaders } =
			await setActiveOrganizationViaHandler(env, request, organizationId);

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
				correlationId,
			});
		}

		appendOAuthCorrelationCookie(setCookieHeaders, request, correlationId);

		logOAuthFlowEvent({
			step: "select_org",
			outcome: "success",
			clientId,
			correlationId,
			durationMs: Date.now() - started,
		});
		throw redirect(redirectUrl, { headers: setCookieHeaders });
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		return mapUnknownConsentError(error, {
			step: "select_org",
			clientId,
			correlationId,
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
		<OAuthCard
			title="Select household"
			description="Choose which Ration group this AI agent may access. One grant applies to a single household."
			error={loaderData.flowError ?? actionData?.error}
		>
			<Form method="post" reloadDocument className="space-y-3">
				<input
					type="hidden"
					name="oauth_query_b64"
					value={loaderData.oauthQueryB64}
				/>
				{loaderData.memberships.map((m: MembershipRow) => (
					<label
						key={m.organizationId}
						className="flex cursor-pointer items-center gap-3 rounded-xl border border-platinum/50 p-4 hover:border-hyper-green/50 transition-colors"
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
							<span className="text-xs text-muted capitalize">{m.role}</span>
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
		</OAuthCard>
	);
}
