import { and, eq, lte, notLike, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
	AGENT_STUB_EMAIL_LIKE_PATTERN,
	isReengagementEmailRecipient,
} from "./agent/stub-user";
import {
	buildReengagementEmail,
	sendEmail,
	shouldSkipEmailSend,
} from "./email.server";
import { log, redactId } from "./logging.server";
import type { UserSettings } from "./types";
import {
	computeLastActiveAtMs,
	getReengagementCutoffUnix,
	INACTIVITY_DAYS,
	isEligibleForReengagementEmail,
	timestampToMs,
} from "./user-activity.server";

/** Cap sends per cron run to stay within Email Service rate limits. */
export const MAX_REENGAGEMENT_EMAILS_PER_RUN = 50;

/** Drizzle SQL: latest Hub / API / settings activity as unix seconds. */
function userLastActiveUnixSql() {
	return sql<number>`MAX(
		COALESCE(
			(
				SELECT MAX(${schema.session.updatedAt})
				FROM ${schema.session}
				WHERE ${schema.session.userId} = ${schema.user.id}
			),
			0
		),
		COALESCE(
			(
				SELECT MAX(${schema.apiKey.lastUsedAt})
				FROM ${schema.apiKey}
				WHERE ${schema.apiKey.userId} = ${schema.user.id}
			),
			0
		),
		COALESCE(
			unixepoch(json_extract(${schema.user.settings}, '$.lastActiveAt')),
			0
		)
	)`;
}

function reengagementCandidateWhere(nowMs: number) {
	const { inactiveCutoffUnix, emailCooldownCutoffUnix } =
		getReengagementCutoffUnix(nowMs);
	const accountAgeCutoff = new Date(inactiveCutoffUnix * 1000);

	return and(
		eq(schema.user.emailVerified, true),
		lte(schema.user.createdAt, accountAgeCutoff),
		notLike(schema.user.email, AGENT_STUB_EMAIL_LIKE_PATTERN),
		sql`NOT EXISTS (
			SELECT 1
			FROM ${schema.agentRegistration}
			WHERE ${schema.agentRegistration.userId} = ${schema.user.id}
				AND ${schema.agentRegistration.status} = 'pending_claim'
				AND ${schema.agentRegistration.preClaim} = 1
		)`,
		sql`${userLastActiveUnixSql()} < ${inactiveCutoffUnix}`,
		sql`(
			json_extract(${schema.user.settings}, '$.reengagementEmailSentAt') IS NULL
			OR unixepoch(json_extract(${schema.user.settings}, '$.reengagementEmailSentAt')) < ${emailCooldownCutoffUnix}
		)`,
	);
}

export interface ReengagementCandidate {
	id: string;
	email: string;
	name: string;
	settings: UserSettings | null;
	createdAt: Date;
	sessionUpdatedAt: Date | null;
	apiKeyLastUsedAt: Date | null;
}

/**
 * Drizzle query for verified, non-stub users inactive 30+ days with email cooldown elapsed.
 */
export async function findReengagementEmailCandidates(
	db: D1Database,
	now = new Date(),
	limit = MAX_REENGAGEMENT_EMAILS_PER_RUN,
): Promise<ReengagementCandidate[]> {
	const d1 = drizzle(db, { schema });
	const nowMs = now.getTime();

	return d1
		.select({
			id: schema.user.id,
			email: schema.user.email,
			name: schema.user.name,
			settings: schema.user.settings,
			createdAt: schema.user.createdAt,
			sessionUpdatedAt: sql<Date | null>`(
				SELECT MAX(${schema.session.updatedAt})
				FROM ${schema.session}
				WHERE ${schema.session.userId} = ${schema.user.id}
			)`,
			apiKeyLastUsedAt: sql<Date | null>`(
				SELECT MAX(${schema.apiKey.lastUsedAt})
				FROM ${schema.apiKey}
				WHERE ${schema.apiKey.userId} = ${schema.user.id}
			)`,
		})
		.from(schema.user)
		.where(reengagementCandidateWhere(nowMs))
		.orderBy(schema.user.id)
		.limit(limit);
}

async function markReengagementEmailSent(
	db: D1Database,
	userId: string,
	now: Date,
): Promise<void> {
	const d1 = drizzle(db, { schema });
	const row = await d1.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { settings: true },
	});
	const current = (row?.settings as UserSettings) ?? {};
	await d1
		.update(schema.user)
		.set({
			settings: {
				...current,
				reengagementEmailSentAt: now.toISOString(),
			},
		})
		.where(eq(schema.user.id, userId));
}

function isCandidateEligibleForSend(
	candidate: ReengagementCandidate,
	nowMs: number,
): boolean {
	if (
		!isReengagementEmailRecipient({
			email: candidate.email,
			emailVerified: true,
		})
	) {
		return false;
	}

	const settings = candidate.settings ?? {};
	const lastActiveAtMs = computeLastActiveAtMs({
		sessionUpdatedAtMs: timestampToMs(candidate.sessionUpdatedAt),
		apiKeyLastUsedAtMs: timestampToMs(candidate.apiKeyLastUsedAt),
		settingsLastActiveAtMs: settings.lastActiveAt
			? new Date(settings.lastActiveAt).getTime()
			: 0,
	});

	return isEligibleForReengagementEmail({
		lastActiveAtMs,
		userCreatedAtMs: timestampToMs(candidate.createdAt),
		reengagementEmailSentAt: settings.reengagementEmailSentAt,
		nowMs,
	});
}

/**
 * Daily cron: email users inactive for 30+ days (Hub session, API key, or MCP).
 */
export async function sendReengagementEmails(
	env: Env,
	now = new Date(),
): Promise<void> {
	if (shouldSkipEmailSend(env)) return;

	const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
	const hubUrl = `${baseUrl}/hub`;
	const connectUrl = `${baseUrl}/connect`;
	const privacyUrl = `${baseUrl}/legal/privacy`;
	const nowMs = now.getTime();

	const candidates = await findReengagementEmailCandidates(
		env.DB,
		now,
		MAX_REENGAGEMENT_EMAILS_PER_RUN,
	);

	let sent = 0;
	for (const candidate of candidates) {
		if (!isCandidateEligibleForSend(candidate, nowMs)) {
			continue;
		}

		const { subject, html, text } = buildReengagementEmail({
			hubUrl,
			connectUrl,
			privacyUrl,
			userName: candidate.name,
			inactiveDays: INACTIVITY_DAYS,
		});

		try {
			await sendEmail(env.EMAIL, {
				to: candidate.email,
				subject,
				html,
				text,
			});
			await markReengagementEmailSent(env.DB, candidate.id, now);
			sent += 1;
		} catch (err) {
			log.error("[CRON] Re-engagement email failed", {
				userId: redactId(candidate.id),
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}

	if (sent > 0) {
		log.info("[CRON] Sent re-engagement emails", { sent });
	}
}
