import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { buildPersonalOrgRecords } from "~/lib/agent/org-records.server";
import { getAuth } from "~/lib/auth.server";
import {
	issueMobileTokenPair,
	type MobileTokenPair,
} from "~/lib/mobile/token.server";
import type { MobileSocialAuthInput } from "~/lib/schemas/mobile/auth";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";

export class MobileSocialAuthError extends Error {
	constructor(
		readonly code: string,
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "MobileSocialAuthError";
	}
}

async function resolveActiveOrganizationId(
	env: Cloudflare.Env,
	userId: string,
): Promise<string | null> {
	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
	});

	const userSettings = (user?.settings as { defaultGroupId?: string }) || {};
	const defaultGroupId = userSettings.defaultGroupId;

	if (defaultGroupId) {
		const membership = await db.query.member.findFirst({
			where: (member, { and, eq }) =>
				and(
					eq(member.organizationId, defaultGroupId),
					eq(member.userId, userId),
				),
		});
		if (membership) return defaultGroupId;
	}

	const personalGroup = await db.query.organization.findFirst({
		where: like(schema.organization.slug, `personal-${userId}`),
	});

	return personalGroup?.id ?? null;
}

/** Ensures a personal org exists — idempotent fallback if the signup hook is still in flight. */
async function ensureOrganizationForUser(
	env: Cloudflare.Env,
	userId: string,
	userName: string,
): Promise<string> {
	const existing = await resolveActiveOrganizationId(env, userId);
	if (existing) return existing;

	const db = drizzle(env.DB, { schema });
	const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
		userId,
		userName,
	);

	const slug = `personal-${userId}`;
	const personalGroup = await db.query.organization.findFirst({
		where: like(schema.organization.slug, slug),
	});
	if (personalGroup) return personalGroup.id;

	await db.batch([
		db.insert(schema.organization).values(orgValues),
		db.insert(schema.member).values(memberValues),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);

	return orgId;
}

async function enforceTosAcceptance(
	env: Cloudflare.Env,
	userId: string,
	tosAccepted: boolean,
): Promise<void> {
	if (tosAccepted !== true) {
		throw new MobileSocialAuthError(
			"tos_required",
			403,
			"Terms of Service acceptance required",
		);
	}

	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { tosAcceptedAt: true },
	});

	if (user?.tosAcceptedAt) return;

	await db
		.update(schema.user)
		.set({
			tosAcceptedAt: new Date(),
			tosVersion: CURRENT_TOS_VERSION,
			updatedAt: new Date(),
		})
		.where(eq(schema.user.id, userId));
}

async function applyAppleDisplayName(
	env: Cloudflare.Env,
	userId: string,
	fullName: string | undefined,
): Promise<void> {
	const trimmed = fullName?.trim();
	if (!trimmed) return;

	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { name: true },
	});

	if (user?.name?.trim()) return;

	await db
		.update(schema.user)
		.set({ name: trimmed, updatedAt: new Date() })
		.where(eq(schema.user.id, userId));
}

/**
 * Verifies a native Google or Apple ID token via Better Auth, ensures org context,
 * and mints the standard mobile JWT + refresh token pair.
 */
export async function authenticateMobileSocial(
	env: Cloudflare.Env,
	input: MobileSocialAuthInput,
): Promise<MobileTokenPair> {
	const auth = getAuth(env);

	const idTokenBody =
		input.provider === "google"
			? {
					token: input.idToken,
					...(input.accessToken ? { accessToken: input.accessToken } : {}),
				}
			: {
					token: input.idToken,
					nonce: input.nonce,
					...(input.fullName
						? {
								user: {
									name: {
										firstName: input.fullName.givenName,
										lastName: input.fullName.familyName,
									},
								},
							}
						: {}),
				};

	let signInResult: Awaited<ReturnType<typeof auth.api.signInSocial>>;
	try {
		signInResult = await auth.api.signInSocial({
			body: {
				provider: input.provider,
				idToken: idTokenBody,
			},
		});
	} catch {
		throw new MobileSocialAuthError(
			"authentication_failed",
			401,
			"Authentication failed",
		);
	}

	if (signInResult.redirect || !("user" in signInResult)) {
		throw new MobileSocialAuthError(
			"authentication_failed",
			401,
			"Authentication failed",
		);
	}

	const user = signInResult.user;
	if (!user?.id) {
		throw new MobileSocialAuthError(
			"authentication_failed",
			401,
			"Authentication failed",
		);
	}

	await enforceTosAcceptance(env, user.id, input.tosAccepted);

	if (input.provider === "apple" && input.fullName) {
		const parts = [input.fullName.givenName, input.fullName.familyName].filter(
			Boolean,
		);
		await applyAppleDisplayName(
			env,
			user.id,
			parts.join(" ").trim() || undefined,
		);
	}

	const organizationId = await ensureOrganizationForUser(
		env,
		user.id,
		user.name ?? "My",
	);
	if (!organizationId) {
		throw new MobileSocialAuthError(
			"no_organization",
			503,
			"Account setup incomplete. Please try again.",
		);
	}

	return issueMobileTokenPair(env, user.id, organizationId);
}
