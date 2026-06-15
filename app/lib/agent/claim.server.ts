import { and, eq, like, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { POST_CLAIM_API_SCOPES } from "../agent/scopes";
import { constantTimeEqual } from "../api-key.server";
import { invalidateTierCache } from "../capacity.server";
import { log, redactId } from "../logging.server";
import {
	CLAIM_OTP_MAX_ATTEMPTS,
	CLAIM_OTP_TTL_SEC,
	claimOtpKvKey,
	generateOtp,
	hashToken,
} from "./claim-crypto.server";
import { buildPersonalOrgRecords } from "./org-records.server";

type OtpKvPayload = {
	hash: string;
	email: string;
	attempts: number;
};

export function getClientIp(request: Request): string {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown"
	);
}

export async function findRegistrationByClaimToken(
	env: Cloudflare.Env,
	claimToken: string,
) {
	const claimTokenHash = await hashToken(claimToken);
	const db = drizzle(env.DB, { schema });
	return db.query.agentRegistration.findFirst({
		where: eq(schema.agentRegistration.claimTokenHash, claimTokenHash),
	});
}

export function isRegistrationClaimable(
	registration: typeof schema.agentRegistration.$inferSelect,
	now = new Date(),
): boolean {
	return (
		registration.status === "pending_claim" &&
		registration.claimTokenExpiresAt.getTime() > now.getTime()
	);
}

export async function storeClaimOtp(
	env: Cloudflare.Env,
	registrationId: string,
	email: string,
	otp: string,
): Promise<void> {
	const hash = await hashToken(otp);
	const payload: OtpKvPayload = {
		hash,
		email: email.toLowerCase(),
		attempts: 0,
	};
	await env.RATION_KV.put(
		claimOtpKvKey(registrationId),
		JSON.stringify(payload),
		{
			expirationTtl: CLAIM_OTP_TTL_SEC,
		},
	);
}

export async function verifyClaimOtp(
	env: Cloudflare.Env,
	registrationId: string,
	email: string,
	otp: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const raw = await env.RATION_KV.get(claimOtpKvKey(registrationId));
	if (!raw) {
		return { ok: false, reason: "otp_expired" };
	}

	const payload = JSON.parse(raw) as OtpKvPayload;
	if (payload.email !== email.toLowerCase()) {
		return { ok: false, reason: "email_mismatch" };
	}

	if (payload.attempts >= CLAIM_OTP_MAX_ATTEMPTS) {
		return { ok: false, reason: "too_many_attempts" };
	}

	const otpHash = await hashToken(otp);
	if (!constantTimeEqual(otpHash, payload.hash)) {
		payload.attempts += 1;
		await env.RATION_KV.put(
			claimOtpKvKey(registrationId),
			JSON.stringify(payload),
			{ expirationTtl: CLAIM_OTP_TTL_SEC },
		);
		return { ok: false, reason: "invalid_otp" };
	}

	await env.RATION_KV.delete(claimOtpKvKey(registrationId));
	return { ok: true };
}

/** Build org-scoped migration statements from stub org to canonical org. */
function buildOrgDataMigrationStatements(
	db: ReturnType<typeof drizzle<typeof schema>>,
	stubOrgId: string,
	canonicalOrgId: string,
) {
	const tables = [
		schema.cargo,
		schema.meal,
		schema.activeMealSelection,
		schema.supplyList,
		schema.supplySnooze,
		schema.mealPlan,
		schema.ledger,
		schema.invitation,
		schema.queueJob,
	] as const;

	return tables.map((table) =>
		db
			.update(table)
			.set({ organizationId: canonicalOrgId })
			.where(eq(table.organizationId, stubOrgId)),
	);
}

/**
 * Merge a stub agent user/org into an existing human account.
 * Migrates org data, re-points API key, deletes stub user+org.
 */
export async function mergeAgentIntoUser(
	env: Cloudflare.Env,
	params: {
		registration: typeof schema.agentRegistration.$inferSelect;
		stubUserId: string;
		stubOrgId: string;
		canonicalUserId: string;
		email: string;
		now?: Date;
	},
): Promise<{ organizationId: string; merged: true }> {
	const db = drizzle(env.DB, { schema });
	const now = params.now ?? new Date();

	const canonicalPersonal = await db.query.organization.findFirst({
		where: like(schema.organization.slug, `personal-${params.canonicalUserId}`),
	});

	let canonicalOrgId = canonicalPersonal?.id;
	const batchStatements = [];
	if (!canonicalOrgId) {
		const canonicalUser = await db.query.user.findFirst({
			where: eq(schema.user.id, params.canonicalUserId),
			columns: { name: true },
		});
		const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
			params.canonicalUserId,
			canonicalUser?.name ?? "My",
		);
		canonicalOrgId = orgId;
		batchStatements.push(
			db.insert(schema.organization).values(orgValues),
			db.insert(schema.member).values(memberValues),
		);
	}

	batchStatements.push(
		...buildOrgDataMigrationStatements(db, params.stubOrgId, canonicalOrgId),
	);

	const scopesJson = JSON.stringify([...POST_CLAIM_API_SCOPES]);

	batchStatements.push(
		db
			.update(schema.apiKey)
			.set({
				organizationId: canonicalOrgId,
				userId: params.canonicalUserId,
				scopes: scopesJson,
				name: "Agent (claimed)",
			})
			.where(eq(schema.apiKey.id, params.registration.apiKeyId)),
		db
			.update(schema.agentRegistration)
			.set({
				status: "claimed",
				claimedByUserId: params.canonicalUserId,
				claimedAt: now,
				preClaim: false,
				userId: params.canonicalUserId,
				organizationId: canonicalOrgId,
			})
			.where(eq(schema.agentRegistration.id, params.registration.id)),
		db
			.delete(schema.member)
			.where(
				and(
					eq(schema.member.organizationId, params.stubOrgId),
					eq(schema.member.userId, params.stubUserId),
				),
			),
		db
			.delete(schema.agentRegistration)
			.where(
				and(
					eq(schema.agentRegistration.organizationId, params.stubOrgId),
					ne(schema.agentRegistration.id, params.registration.id),
				),
			),
		db
			.delete(schema.organization)
			.where(eq(schema.organization.id, params.stubOrgId)),
		db.delete(schema.user).where(eq(schema.user.id, params.stubUserId)),
	);
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await db.batch(batchStatements as [any, ...any[]]);

	await invalidateTierCache(env as Env, canonicalOrgId);
	await invalidateTierCache(env as Env, params.stubOrgId);

	log.info("[AgentClaim] Merged stub agent into existing user", {
		registrationId: redactId(params.registration.id),
		canonicalUserId: redactId(params.canonicalUserId),
	});

	return { organizationId: canonicalOrgId, merged: true };
}

/** Claim on the same stub user record (no existing account for email). */
export async function claimOnStubUser(
	env: Cloudflare.Env,
	params: {
		registration: typeof schema.agentRegistration.$inferSelect;
		stubUserId: string;
		email: string;
		now?: Date;
	},
): Promise<{ organizationId: string; merged: false }> {
	const db = drizzle(env.DB, { schema });
	const now = params.now ?? new Date();
	const scopesJson = JSON.stringify([...POST_CLAIM_API_SCOPES]);

	await db.batch([
		db
			.update(schema.user)
			.set({
				email: params.email.toLowerCase(),
				emailVerified: true,
				updatedAt: now,
			})
			.where(eq(schema.user.id, params.stubUserId)),
		db
			.update(schema.apiKey)
			.set({
				scopes: scopesJson,
				name: "Agent (claimed)",
			})
			.where(eq(schema.apiKey.id, params.registration.apiKeyId)),
		db
			.update(schema.agentRegistration)
			.set({
				status: "claimed",
				claimedByUserId: params.stubUserId,
				claimedAt: now,
				preClaim: false,
			})
			.where(eq(schema.agentRegistration.id, params.registration.id)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types
	] as [any, ...any[]]);

	log.info("[AgentClaim] Claimed stub agent user", {
		registrationId: redactId(params.registration.id),
		userId: redactId(params.stubUserId),
	});

	return {
		organizationId: params.registration.organizationId,
		merged: false,
	};
}

export { generateOtp };
