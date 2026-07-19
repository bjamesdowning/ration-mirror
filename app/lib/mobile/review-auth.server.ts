import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	issueMobileTokenPair,
	type MobileTokenPair,
} from "~/lib/mobile/token.server";
import type { MobileReviewLoginInput } from "~/lib/schemas/mobile/auth";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";

export class MobileReviewAuthError extends Error {
	constructor(
		readonly code: string,
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "MobileReviewAuthError";
	}
}

type ReviewSecrets = {
	email: string;
	password: string;
	userId: string;
};

/** Constant-time string compare for equal-length inputs (returns false if lengths differ). */
export function timingSafeEqualString(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

export function readReviewLoginSecrets(
	env: Cloudflare.Env,
): ReviewSecrets | null {
	const email = env.APP_REVIEW_DEMO_EMAIL?.trim().toLowerCase();
	const password = env.APP_REVIEW_DEMO_PASSWORD;
	const userId = env.APP_REVIEW_DEMO_USER_ID?.trim();
	if (!email || !password || !userId) {
		return null;
	}
	return { email, password, userId };
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
			where: (member, { and, eq: eqCol }) =>
				and(
					eqCol(member.organizationId, defaultGroupId),
					eqCol(member.userId, userId),
				),
		});
		if (membership) return defaultGroupId;
	}

	const personalGroup = await db.query.organization.findFirst({
		where: like(schema.organization.slug, `personal-${userId}`),
	});

	return personalGroup?.id ?? null;
}

async function enforceTosAcceptance(
	env: Cloudflare.Env,
	userId: string,
	tosAccepted: boolean,
): Promise<void> {
	if (tosAccepted !== true) {
		throw new MobileReviewAuthError(
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

/**
 * Authenticates the single App Review demo account using Wrangler secrets.
 * Callers must enforce the `app-review-login` feature flag before invoking.
 */
export async function authenticateMobileReviewLogin(
	env: Cloudflare.Env,
	input: MobileReviewLoginInput,
): Promise<MobileTokenPair> {
	const secrets = readReviewLoginSecrets(env);
	if (!secrets) {
		throw new MobileReviewAuthError(
			"review_login_unavailable",
			503,
			"Review login is not configured.",
		);
	}

	const emailNorm = input.email.trim().toLowerCase();
	const emailOk = timingSafeEqualString(emailNorm, secrets.email);
	const passwordOk = timingSafeEqualString(input.password, secrets.password);
	if (!emailOk || !passwordOk) {
		throw new MobileReviewAuthError(
			"invalid_credentials",
			401,
			"Invalid credentials",
		);
	}

	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, secrets.userId),
		columns: { id: true, email: true },
	});
	if (!user) {
		throw new MobileReviewAuthError(
			"review_login_unavailable",
			503,
			"Review account is not ready.",
		);
	}

	const storedEmail = user.email.trim().toLowerCase();
	if (!timingSafeEqualString(storedEmail, secrets.email)) {
		throw new MobileReviewAuthError(
			"review_login_unavailable",
			503,
			"Review account is not ready.",
		);
	}

	await enforceTosAcceptance(env, secrets.userId, input.tosAccepted);

	const organizationId = await resolveActiveOrganizationId(env, secrets.userId);
	if (!organizationId) {
		throw new MobileReviewAuthError(
			"no_organization",
			503,
			"Account setup incomplete. Please try again.",
		);
	}

	return issueMobileTokenPair(env, secrets.userId, organizationId);
}
