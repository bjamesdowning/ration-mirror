import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nutritionConsent } from "../../db/schema";
import {
	getNutritionConsentStatement,
	type NutritionConsentPurpose,
	type NutritionConsentStatement,
} from "./consent-policy";

export type NutritionConsentSource = "web" | "mobile" | "mcp" | "copilot";

export type NutritionConsentState =
	| "active"
	| "not_granted"
	| "withdrawn"
	| "reconsent_required";

export type NutritionConsentStatus = {
	purpose: NutritionConsentPurpose;
	state: NutritionConsentState;
	consentId: string | null;
	grantedAt: Date | null;
	withdrawnAt: Date | null;
	statement: NutritionConsentStatement;
};

export class NutritionConsentError extends Error {
	constructor(
		readonly code:
			| "nutrition_consent_required"
			| "nutrition_reconsent_required"
			| "nutrition_consent_statement_stale"
			| "nutrition_consent_request_conflict",
		message: string,
		readonly statement: NutritionConsentStatement,
		readonly status: 403 | 409 = 403,
	) {
		super(message);
		this.name = "NutritionConsentError";
	}
}

export type GrantNutritionConsentInput = {
	userId: string;
	purpose: NutritionConsentPurpose;
	source: NutritionConsentSource;
	policyVersion: string;
	statementVersion: string;
	statementSha256: string;
	affirmed: true;
	clientSurface: string;
	clientVersion?: string | null;
	locale?: string | null;
	requestId: string;
	now?: Date;
};

type RawConsentRow = {
	id: string;
	user_id: string;
	purpose: NutritionConsentPurpose;
	policy_version: string;
	source: string;
	granted_at: number;
	withdrawn_at: number | null;
	statement_version: string | null;
	statement_sha256: string | null;
	privacy_notice_version: string | null;
	client_surface: string | null;
	client_version: string | null;
	locale: string | null;
	request_id: string | null;
	withdraw_request_id: string | null;
	created_at: number;
};

function fromUnixSeconds(value: number | null): Date | null {
	return value == null ? null : new Date(value * 1_000);
}

function normalizeRawConsentRow(row: RawConsentRow) {
	return {
		id: row.id,
		userId: row.user_id,
		purpose: row.purpose,
		policyVersion: row.policy_version,
		source: row.source,
		grantedAt: fromUnixSeconds(row.granted_at) as Date,
		withdrawnAt: fromUnixSeconds(row.withdrawn_at),
		statementVersion: row.statement_version,
		statementSha256: row.statement_sha256,
		privacyNoticeVersion: row.privacy_notice_version,
		clientSurface: row.client_surface,
		clientVersion: row.client_version,
		locale: row.locale,
		requestId: row.request_id,
		withdrawRequestId: row.withdraw_request_id,
		createdAt: fromUnixSeconds(row.created_at) as Date,
	};
}

function statementMatches(
	row: {
		policyVersion: string;
		statementVersion: string | null;
		statementSha256: string | null;
		privacyNoticeVersion: string | null;
	},
	statement: NutritionConsentStatement,
): boolean {
	return (
		row.policyVersion === statement.policyVersion &&
		row.statementVersion === statement.statementVersion &&
		row.statementSha256 === statement.sha256 &&
		row.privacyNoticeVersion === statement.privacyNoticeVersion
	);
}

export async function getNutritionConsentStatus(
	db: D1Database,
	userId: string,
	purpose: NutritionConsentPurpose,
): Promise<NutritionConsentStatus> {
	const statement = await getNutritionConsentStatement(purpose);
	const rows = await drizzle(db)
		.select()
		.from(nutritionConsent)
		.where(
			and(
				eq(nutritionConsent.userId, userId),
				eq(nutritionConsent.purpose, purpose),
			),
		)
		.orderBy(desc(nutritionConsent.grantedAt))
		.limit(50);

	const activeRows = rows.filter((row) => row.withdrawnAt == null);
	const current = activeRows.find((row) => statementMatches(row, statement));
	if (current) {
		return {
			purpose,
			state: "active",
			consentId: current.id,
			grantedAt: current.grantedAt,
			withdrawnAt: null,
			statement,
		};
	}

	if (activeRows.length > 0) {
		const latest = activeRows[0];
		return {
			purpose,
			state: "reconsent_required",
			consentId: null,
			grantedAt: latest?.grantedAt ?? null,
			withdrawnAt: null,
			statement,
		};
	}

	const latest = rows[0];
	return {
		purpose,
		state: latest ? "withdrawn" : "not_granted",
		consentId: null,
		grantedAt: latest?.grantedAt ?? null,
		withdrawnAt: latest?.withdrawnAt ?? null,
		statement,
	};
}

function consentPurposeBucket(
	purpose: NutritionConsentPurpose,
): "goals" | "intake" | "agent" | "other" {
	if (purpose === "goals") return "goals";
	if (purpose === "intake") return "intake";
	if (purpose === "agent_processing") return "agent";
	return "other";
}

export async function grantNutritionConsent(
	db: D1Database,
	input: GrantNutritionConsentInput,
) {
	const { emitNutritionConsent } = await import("~/lib/telemetry.server");
	const statement = await getNutritionConsentStatement(input.purpose);
	if (
		!input.affirmed ||
		input.policyVersion !== statement.policyVersion ||
		input.statementVersion !== statement.statementVersion ||
		input.statementSha256 !== statement.sha256
	) {
		emitNutritionConsent("denied", consentPurposeBucket(input.purpose));
		throw new NutritionConsentError(
			"nutrition_consent_statement_stale",
			"The consent statement changed. Review the current statement before continuing.",
			statement,
			409,
		);
	}

	const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
	const existingByRequest = await db
		.prepare(
			`SELECT * FROM nutrition_consent
			 WHERE user_id = ? AND request_id = ?`,
		)
		.bind(input.userId, input.requestId)
		.first<RawConsentRow>();
	if (existingByRequest) {
		const row = normalizeRawConsentRow(existingByRequest);
		if (
			row.userId !== input.userId ||
			row.purpose !== input.purpose ||
			!statementMatches(row, statement)
		) {
			throw new NutritionConsentError(
				"nutrition_consent_request_conflict",
				"The request ID is already bound to another nutrition consent action.",
				statement,
				409,
			);
		}
		return row;
	}

	const id = crypto.randomUUID();
	// SQLite allows a single ON CONFLICT target per INSERT. Replay by request_id
	// is handled above; this upsert covers concurrent grants of the same active
	// (user, purpose, policy_version) row.
	const result = await db
		.prepare(
			`INSERT INTO nutrition_consent (
				id, user_id, purpose, policy_version, source, granted_at,
				statement_version, statement_sha256, privacy_notice_version,
				client_surface, client_version, locale, request_id, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, purpose, policy_version) WHERE withdrawn_at IS NULL
				DO UPDATE SET id = nutrition_consent.id
			RETURNING *`,
		)
		.bind(
			id,
			input.userId,
			input.purpose,
			statement.policyVersion,
			input.source,
			nowSeconds,
			statement.statementVersion,
			statement.sha256,
			statement.privacyNoticeVersion,
			input.clientSurface,
			input.clientVersion ?? null,
			input.locale ?? null,
			input.requestId,
			nowSeconds,
		)
		.first<RawConsentRow>();

	if (!result) {
		throw new Error("Consent grant did not return a row");
	}
	const row = normalizeRawConsentRow(result);
	if (
		row.userId !== input.userId ||
		row.purpose !== input.purpose ||
		!statementMatches(row, statement)
	) {
		emitNutritionConsent("denied", consentPurposeBucket(input.purpose));
		throw new NutritionConsentError(
			"nutrition_consent_request_conflict",
			"The request ID is already bound to another nutrition consent action.",
			statement,
			409,
		);
	}
	emitNutritionConsent("grant", consentPurposeBucket(input.purpose));
	return row;
}

export async function assertActiveNutritionConsent(
	db: D1Database,
	userId: string,
	purpose: NutritionConsentPurpose,
) {
	const status = await getNutritionConsentStatus(db, userId, purpose);
	if (status.state !== "active" || !status.consentId) {
		const reconsent = status.state === "reconsent_required";
		throw new NutritionConsentError(
			reconsent ? "nutrition_reconsent_required" : "nutrition_consent_required",
			reconsent
				? "Review and accept the current nutrition consent statement before continuing."
				: "Explicit nutrition consent is required before continuing.",
			status.statement,
		);
	}
	return {
		id: status.consentId,
		grantedAt: status.grantedAt as Date,
		statement: status.statement,
	};
}

export async function withdrawNutritionConsent(
	db: D1Database,
	input: {
		userId: string;
		purpose: NutritionConsentPurpose;
		requestId: string;
		now?: Date;
	},
): Promise<NutritionConsentStatus> {
	const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
	try {
		await db
			.prepare(
				`UPDATE nutrition_consent
			SET withdrawn_at = ?,
				withdraw_request_id = CASE
					WHEN id = (
						SELECT id FROM nutrition_consent
						WHERE user_id = ? AND purpose = ? AND withdrawn_at IS NULL
						ORDER BY granted_at DESC LIMIT 1
					) THEN ?
					ELSE withdraw_request_id
				END
			WHERE user_id = ? AND purpose = ? AND withdrawn_at IS NULL`,
			)
			.bind(
				nowSeconds,
				input.userId,
				input.purpose,
				input.requestId,
				input.userId,
				input.purpose,
			)
			.run();
	} catch (error) {
		const prior = await db
			.prepare(
				`SELECT purpose FROM nutrition_consent
				WHERE user_id = ? AND withdraw_request_id = ? LIMIT 1`,
			)
			.bind(input.userId, input.requestId)
			.first<{ purpose: NutritionConsentPurpose }>();
		if (!prior) throw error;
		if (prior.purpose !== input.purpose) {
			throw new NutritionConsentError(
				"nutrition_consent_request_conflict",
				"The request ID is already bound to another nutrition consent action.",
				await getNutritionConsentStatement(input.purpose),
				409,
			);
		}
	}

	const { emitNutritionConsent } = await import("~/lib/telemetry.server");
	emitNutritionConsent("withdraw", consentPurposeBucket(input.purpose));
	return getNutritionConsentStatus(db, input.userId, input.purpose);
}

export async function eraseNutritionData(
	db: D1Database,
	input: {
		userId: string;
		dataset: "goals" | "intake" | "all";
		requestId: string;
	},
): Promise<{ dataset: "goals" | "intake" | "all"; erased: true }> {
	const statements: D1PreparedStatement[] = [];
	if (input.dataset === "goals" || input.dataset === "all") {
		statements.push(
			db
				.prepare("DELETE FROM nutrition_goal WHERE user_id = ?")
				.bind(input.userId),
			db
				.prepare(
					"DELETE FROM nutrition_operation WHERE user_id = ? AND operation_type IN ('set_goal', 'clear_goal')",
				)
				.bind(input.userId),
		);
	}
	if (input.dataset === "intake" || input.dataset === "all") {
		statements.push(
			db
				.prepare("DELETE FROM nutrition_intake WHERE user_id = ?")
				.bind(input.userId),
			db
				.prepare(
					"DELETE FROM nutrition_operation WHERE user_id = ? AND operation_type IN ('log_manifest_intakes', 'clear_manifest_intakes')",
				)
				.bind(input.userId),
		);
	}
	await db.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
	const { emitNutritionConsent } = await import("~/lib/telemetry.server");
	emitNutritionConsent("erase", "other");
	return { dataset: input.dataset, erased: true };
}

export async function listActiveNutritionConsents(
	db: D1Database,
	userId: string,
) {
	return drizzle(db)
		.select()
		.from(nutritionConsent)
		.where(
			and(
				eq(nutritionConsent.userId, userId),
				isNull(nutritionConsent.withdrawnAt),
			),
		);
}
