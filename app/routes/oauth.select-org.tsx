import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { data, Form, redirect } from "react-router";
import * as schema from "~/db/schema";
import { getAuth, requireAuth } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import { oauthErrorDetail } from "~/lib/oauth-flow";

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
	const db = drizzle(context.cloudflare.env.DB, { schema });
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

	const url = new URL(request.url);
	return {
		memberships,
		oauthQuery:
			url.searchParams.get("oauth_query") ?? url.search.replace(/^\?/, ""),
		clientId: url.searchParams.get("client_id") ?? "",
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
	const form = await request.formData();
	const organizationId = form.get("organizationId");
	const oauthQuery = form.get("oauth_query");

	if (typeof organizationId !== "string" || !organizationId) {
		return data({ error: "Select a household." }, { status: 400 });
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const membership = await db.query.member.findFirst({
		where: (member, { and, eq }) =>
			and(
				eq(member.userId, session.user.id),
				eq(member.organizationId, organizationId),
			),
	});

	if (!membership) {
		return data(
			{ error: "You are not a member of that household." },
			{ status: 403 },
		);
	}

	await db
		.update(schema.session)
		.set({ activeOrganizationId: organizationId })
		.where(eq(schema.session.id, session.session.id));

	const auth = getAuth(context.cloudflare.env);
	let continueResult: Awaited<ReturnType<typeof auth.api.oauth2Continue>>;
	try {
		continueResult = await auth.api.oauth2Continue({
			headers: request.headers,
			body: {
				postLogin: true,
				...(typeof oauthQuery === "string" && oauthQuery
					? { oauth_query: oauthQuery }
					: {}),
			},
		});
	} catch (error) {
		log.error("OAuth continue (org selection) failed", error, {
			clientId: redactId(
				typeof oauthQuery === "string"
					? new URLSearchParams(oauthQuery).get("client_id")
					: null,
			),
			detail: oauthErrorDetail(error),
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
		continueResult &&
		typeof continueResult === "object" &&
		"redirect" in continueResult &&
		continueResult.redirect &&
		"url" in continueResult &&
		typeof continueResult.url === "string"
	) {
		throw redirect(continueResult.url);
	}

	if (
		continueResult &&
		typeof continueResult === "object" &&
		"redirect_uri" in continueResult &&
		typeof continueResult.redirect_uri === "string"
	) {
		throw redirect(continueResult.redirect_uri);
	}

	throw redirect("/oauth/consent");
}

export default function OAuthSelectOrgPage({
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
					Select household
				</h1>
				<p className="text-sm text-carbon/70 mb-6">
					Choose which Ration group this AI agent may access. One grant applies
					to a single household.
				</p>

				{actionData?.error && (
					<p className="mb-4 text-sm text-red-600">{actionData.error}</p>
				)}

				<Form method="post" className="space-y-3">
					<input
						type="hidden"
						name="oauth_query"
						value={loaderData.oauthQuery}
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
