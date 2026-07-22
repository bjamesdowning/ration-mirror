import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { buildPersonalOrgRecords } from "~/lib/agent/org-records.server";
import { getAuth } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import {
	issueMobileTokenPair,
	type MobileTokenPair,
} from "~/lib/mobile/token.server";
import type { MobileSocialAuthInput } from "~/lib/schemas/mobile/auth";
import {
	buildStarterMealStatements,
	seedStarterMealIfNeeded,
	shouldSeedStarterMeal,
} from "~/lib/starter-meal.server";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";
import { grantWelcomeCreditsIfEligible } from "~/lib/welcome-credits.server";

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
	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { email: true },
	});
	const email = user?.email ?? null;

	const existing = await resolveActiveOrganizationId(env, userId);
	if (existing) {
		await trySeedStarterMeal(db, existing, email, userId);
		return existing;
	}

	const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
		userId,
		userName,
	);

	const slug = `personal-${userId}`;
	const personalGroup = await db.query.organization.findFirst({
		where: like(schema.organization.slug, slug),
	});
	if (personalGroup) {
		await trySeedStarterMeal(db, personalGroup.id, email, userId);
		return personalGroup.id;
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch mixes insert types
	const batchStmts: any[] = [
		db.insert(schema.organization).values(orgValues),
		db.insert(schema.member).values(memberValues),
	];
	if (shouldSeedStarterMeal(email)) {
		const { mealInsert, ingredientInsert } = buildStarterMealStatements(
			db,
			orgId,
		);
		batchStmts.push(mealInsert, ingredientInsert);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await db.batch(batchStmts as [any, ...any[]]);

	if (email) {
		await grantWelcomeCreditsIfEligible(env, {
			userId,
			organizationId: orgId,
			email,
		});
	}

	return orgId;
}

/** Starter meal must never block mobile auth — mirror welcome-credits isolation. */
async function trySeedStarterMeal(
	db: Parameters<typeof seedStarterMealIfNeeded>[0],
	organizationId: string,
	email: string | null,
	userId: string,
): Promise<void> {
	try {
		await seedStarterMealIfNeeded(db, organizationId, email);
	} catch (error) {
		log.error("[Auth] Failed to seed starter meal", error, {
			userId: redactId(userId),
			orgId: redactId(organizationId),
		});
	}
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
				...(input.provider === "apple" ? { requestSignUp: true } : {}),
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
