/**
 * Durable recipe-import reservation, debit, and dispatch.
 * Credits move only inside the guarded batch. Queue send failures stay
 * retryable and are never refunded before the dispatch deadline.
 */
import { data } from "react-router";
import type { ImportSourceKind } from "~/lib/import/classify-import-url";
import {
	AI_COSTS,
	InsufficientCreditsError,
	refundAiJobCredits,
} from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import {
	importPageR2Key,
	importPhotoR2Key,
} from "~/lib/recipe-import-block.server";
import type { RecipeImportRequest } from "~/lib/schemas/recipe-import";

export const IMPORT_DISPATCH_DEADLINE_SECONDS = 15 * 60;
const JOB_TTL_SECONDS = 3600;

export type ImportDispatchState =
	| "reserved"
	| "debited"
	| "dispatched"
	| "failed";

type DispatchPayload = {
	url: string;
	userText?: string;
	sourceKind: ImportSourceKind;
	cost: number;
	pageR2Key?: string;
	photoR2Key?: string;
	photoMimeType?: string;
	contentSource?: "client";
};

export type DurableImportInput = {
	userId: string;
	organizationId: string;
	clientRequestId?: string;
	url: string;
	userText?: string;
	pageHtml?: string;
	photoBase64?: string;
	photoMimeType?: RecipeImportRequest["photoMimeType"];
	sourceKind: ImportSourceKind;
	hasPhoto: boolean;
};

type DispatchRow = {
	request_id: string;
	organization_id: string;
	user_id: string;
	job_type: string;
	content_hash: string;
	payload_json: string | null;
	state: ImportDispatchState;
	attempts: number;
	created_at: number;
	ledger_idempotency_key: string | null;
};

function unixNow(now = new Date()): number {
	return Math.floor(now.getTime() / 1000);
}

function debitKey(requestId: string): string {
	return `import-debit:${requestId}`;
}

export async function hashImportContent(parts: {
	url: string;
	userText: string;
	pageHtml: string;
	photoBase64: string;
}): Promise<string> {
	const bytes = new TextEncoder().encode(
		[parts.url, parts.userText, parts.pageHtml, parts.photoBase64].join("\n"),
	);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function isUniqueConflict(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /unique/i.test(message);
}

async function readDispatch(
	db: D1Database,
	requestId: string,
): Promise<DispatchRow | null> {
	const row = await db
		.prepare(
			`SELECT request_id, organization_id, user_id, job_type, content_hash,
			        payload_json, state, attempts, created_at, ledger_idempotency_key
			 FROM import_dispatch WHERE request_id = ?1`,
		)
		.bind(requestId)
		.first<DispatchRow>();
	return row ?? null;
}

function assertSameOwner(row: DispatchRow, input: DurableImportInput): void {
	if (
		row.user_id !== input.userId ||
		row.organization_id !== input.organizationId ||
		row.job_type !== "import_url"
	) {
		throw data({ error: "Job not found" }, { status: 404 });
	}
}

async function stageBodies(
	env: Cloudflare.Env,
	requestId: string,
	input: DurableImportInput,
): Promise<DispatchPayload> {
	const payload: DispatchPayload = {
		url: input.url,
		sourceKind: input.sourceKind,
		cost: AI_COSTS.IMPORT_URL,
		...(input.userText?.trim() ? { userText: input.userText.trim() } : {}),
	};
	if (input.pageHtml?.trim() && !input.hasPhoto) {
		const key = importPageR2Key(requestId);
		await env.STORAGE.put(key, input.pageHtml, {
			httpMetadata: { contentType: "text/html; charset=utf-8" },
		});
		payload.pageR2Key = key;
		payload.contentSource = "client";
	}
	if (input.hasPhoto && input.photoBase64 && input.photoMimeType) {
		const key = importPhotoR2Key(requestId);
		const binary = atob(input.photoBase64.replace(/\s/g, ""));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		await env.STORAGE.put(key, bytes.buffer, {
			httpMetadata: { contentType: input.photoMimeType },
		});
		payload.photoR2Key = key;
		payload.photoMimeType = input.photoMimeType;
	}
	return payload;
}

async function deleteStaged(
	env: Cloudflare.Env,
	payload: DispatchPayload | null,
) {
	const keys = [payload?.pageR2Key, payload?.photoR2Key].filter(
		(key): key is string => Boolean(key),
	);
	for (const key of keys) {
		try {
			await env.STORAGE.delete(key);
		} catch {
			log.warn("import_stage_delete_failed", { code: "r2_delete_failed" });
		}
	}
}

function parsePayload(raw: string | null): DispatchPayload | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as DispatchPayload;
		if (!value || typeof value.url !== "string") return null;
		return value;
	} catch {
		return null;
	}
}

async function reserve(
	db: D1Database,
	input: DurableImportInput,
	requestId: string,
	contentHash: string,
	now: number,
): Promise<"inserted" | "exists"> {
	try {
		await db
			.prepare(
				`INSERT INTO import_dispatch (
				   request_id, organization_id, user_id, job_type, content_hash,
				   state, attempts, created_at, updated_at
				 ) VALUES (?1, ?2, ?3, 'import_url', ?4, 'reserved', 0, ?5, ?5)`,
			)
			.bind(requestId, input.organizationId, input.userId, contentHash, now)
			.run();
		return "inserted";
	} catch (error) {
		if (isUniqueConflict(error)) return "exists";
		throw error;
	}
}

async function debitAndEnqueue(
	env: Cloudflare.Env,
	input: DurableImportInput,
	requestId: string,
	payload: DispatchPayload,
	now: number,
): Promise<"debited" | "insufficient" | "replay"> {
	const ledgerId = crypto.randomUUID();
	const expires = now + JOB_TTL_SECONDS;
	const key = debitKey(requestId);
	const payloadJson = JSON.stringify(payload);
	try {
		await env.DB.batch([
			env.DB.prepare(
				`UPDATE organization
				 SET credits = credits - ?1
				 WHERE id = ?2 AND credits >= ?1`,
			).bind(AI_COSTS.IMPORT_URL, input.organizationId),
			env.DB.prepare(
				`INSERT INTO ledger (
				   id, organization_id, user_id, amount, reason, created_at, idempotency_key
				 )
				 SELECT ?1, ?2, ?3, ?4, 'Import URL', ?5, ?6
				 WHERE changes() = 1`,
			).bind(
				ledgerId,
				input.organizationId,
				input.userId,
				-AI_COSTS.IMPORT_URL,
				now,
				key,
			),
			env.DB.prepare(
				`INSERT INTO queue_job (
				   request_id, job_type, organization_id, user_id, status, created_at, expires_at
				 )
				 SELECT ?1, 'import_url', ?2, ?3, 'pending', ?4, ?5
				 WHERE changes() = 1
				   AND NOT EXISTS (SELECT 1 FROM queue_job WHERE request_id = ?1)`,
			).bind(requestId, input.organizationId, input.userId, now, expires),
			env.DB.prepare(
				`UPDATE import_dispatch
				 SET state = 'debited',
				     ledger_idempotency_key = ?1,
				     payload_json = ?2,
				     updated_at = ?3,
				     next_attempt_at = ?3
				 WHERE request_id = ?4
				   AND state = 'reserved'
				   AND changes() = 1`,
			).bind(key, payloadJson, now, requestId),
		]);
	} catch (error) {
		if (isUniqueConflict(error)) return "replay";
		throw error;
	}
	const row = await readDispatch(env.DB, requestId);
	if (row?.state === "debited" || row?.state === "dispatched") return "debited";
	const ledger = await env.DB.prepare(
		`SELECT id FROM ledger WHERE idempotency_key = ?1`,
	)
		.bind(key)
		.first<{ id: string }>();
	if (ledger) return "replay";
	return "insufficient";
}

async function sendQueued(
	env: Cloudflare.Env,
	requestId: string,
	input: Pick<DurableImportInput, "userId" | "organizationId">,
	payload: DispatchPayload,
): Promise<boolean> {
	const queue = env.IMPORT_URL_QUEUE;
	if (!queue) return false;
	const queueUrl =
		payload.url || (payload.photoR2Key ? `photo://${requestId}` : "");
	await queue.send({
		requestId,
		organizationId: input.organizationId,
		userId: input.userId,
		url: queueUrl,
		cost: payload.cost,
		sourceKind: payload.sourceKind,
		...(payload.contentSource ? { contentSource: payload.contentSource } : {}),
		...(payload.userText ? { userText: payload.userText } : {}),
		...(payload.photoR2Key
			? {
					photoR2Key: payload.photoR2Key,
					photoMimeType: payload.photoMimeType ?? "image/jpeg",
				}
			: {}),
	});
	return true;
}

async function markDispatched(
	db: D1Database,
	requestId: string,
	now: number,
): Promise<void> {
	await db
		.prepare(
			`UPDATE import_dispatch
			 SET state = 'dispatched',
			     payload_json = NULL,
			     attempts = attempts + 1,
			     updated_at = ?1
			 WHERE request_id = ?2 AND state = 'debited'`,
		)
		.bind(now, requestId)
		.run();
}

async function dispatchNow(
	env: Cloudflare.Env,
	requestId: string,
	input: Pick<DurableImportInput, "userId" | "organizationId">,
	payload: DispatchPayload,
	now: number,
): Promise<void> {
	try {
		const sent = await sendQueued(env, requestId, input, payload);
		if (!sent) {
			log.warn("import_dispatch_queue_missing", {
				requestId,
				code: "queue_unavailable",
			});
			return;
		}
		await markDispatched(env.DB, requestId, now);
		log.info("import_dispatch_sent", {
			requestId,
			state: "dispatched",
			code: "dispatched",
		});
	} catch {
		log.warn("import_dispatch_send_failed", {
			requestId,
			code: "queue_send_failed",
		});
	}
}

export async function submitDurableRecipeImport(
	env: Cloudflare.Env,
	input: DurableImportInput,
	now = new Date(),
): Promise<{ status: "processing"; requestId: string }> {
	const requestId = input.clientRequestId ?? crypto.randomUUID();
	const nowSec = unixNow(now);
	const contentHash = await hashImportContent({
		url: input.url,
		userText: input.userText?.trim() ?? "",
		pageHtml: input.pageHtml ?? "",
		photoBase64: input.photoBase64 ?? "",
	});
	const existing = await readDispatch(env.DB, requestId);
	if (existing) {
		assertSameOwner(existing, input);
		if (existing.content_hash !== contentHash) {
			throw data(
				{
					error: "Import request does not match",
					code: "import_hash_mismatch",
				},
				{ status: 409 },
			);
		}
		if (existing.state !== "reserved") {
			return { status: "processing", requestId };
		}
	} else {
		const reserved = await reserve(
			env.DB,
			input,
			requestId,
			contentHash,
			nowSec,
		);
		if (reserved === "exists") {
			const raced = await readDispatch(env.DB, requestId);
			if (!raced) throw data({ error: "Job not found" }, { status: 404 });
			assertSameOwner(raced, input);
			if (raced.content_hash !== contentHash) {
				throw data(
					{
						error: "Import request does not match",
						code: "import_hash_mismatch",
					},
					{ status: 409 },
				);
			}
			if (raced.state !== "reserved") {
				return { status: "processing", requestId };
			}
		}
	}

	const payload = await stageBodies(env, requestId, input);
	const debited = await debitAndEnqueue(env, input, requestId, payload, nowSec);
	if (debited === "insufficient") {
		const balance = await env.DB.prepare(
			`SELECT credits FROM organization WHERE id = ?1`,
		)
			.bind(input.organizationId)
			.first<{ credits: number }>();
		throw new InsufficientCreditsError(
			AI_COSTS.IMPORT_URL,
			balance?.credits ?? 0,
		);
	}
	const row = await readDispatch(env.DB, requestId);
	const stored = parsePayload(row?.payload_json ?? null) ?? payload;
	if (row?.state === "debited") {
		await dispatchNow(
			env,
			requestId,
			{ userId: input.userId, organizationId: input.organizationId },
			stored,
			nowSec,
		);
	}
	return { status: "processing", requestId };
}

async function failPendingDispatch(
	env: Cloudflare.Env,
	row: DispatchRow,
	now: number,
): Promise<void> {
	const payload = parsePayload(row.payload_json);
	const age = now - Number(row.created_at);
	if (row.state === "reserved") {
		await deleteStaged(env, payload);
		await env.DB.prepare(
			`UPDATE import_dispatch
			 SET state = 'failed', payload_json = NULL, updated_at = ?1
			 WHERE request_id = ?2 AND state = 'reserved'`,
		)
			.bind(now, row.request_id)
			.run();
		log.info("import_dispatch_expired", {
			requestId: row.request_id,
			state: "failed",
			attempts: row.attempts,
			age,
			code: "reservation_expired",
		});
		return;
	}
	const resultJson = JSON.stringify({
		status: "failed",
		success: false,
		code: "dispatch_failed",
	});
	const write = await env.DB.prepare(
		`UPDATE queue_job
		 SET status = 'failed', result_json = ?1
		 WHERE request_id = ?2 AND status = 'pending'`,
	)
		.bind(resultJson, row.request_id)
		.run();
	if ((write.meta?.changes ?? 0) > 0) {
		await refundAiJobCredits(env, {
			requestId: row.request_id,
			organizationId: row.organization_id,
			userId: row.user_id,
			cost: payload?.cost ?? AI_COSTS.IMPORT_URL,
			reason: "Import URL",
		});
		await deleteStaged(env, payload);
		await env.DB.prepare(
			`UPDATE import_dispatch
			 SET state = 'failed', payload_json = NULL, updated_at = ?1
			 WHERE request_id = ?2 AND state = 'debited'`,
		)
			.bind(now, row.request_id)
			.run();
		log.info("import_dispatch_failed", {
			requestId: row.request_id,
			state: "failed",
			attempts: row.attempts,
			age,
			code: "dispatch_failed",
		});
		return;
	}
	const job = await env.DB.prepare(
		`SELECT status, processing_lease_expires_at AS lease
		 FROM queue_job WHERE request_id = ?1`,
	)
		.bind(row.request_id)
		.first<{ status: string; lease: number | null }>();
	if (!job || job.status === "pending") return;
	if (job.status === "completed") {
		await markDispatched(env.DB, row.request_id, now);
		return;
	}
	if (job.status === "processing" && job.lease != null && job.lease > now) {
		log.info("import_dispatch_lease_grace", {
			requestId: row.request_id,
			state: row.state,
			attempts: row.attempts,
			age,
			code: "lease_grace",
		});
		return;
	}
	log.info("import_dispatch_not_refunded", {
		requestId: row.request_id,
		state: job.status,
		attempts: row.attempts,
		age,
		code: "dispatch_not_refunded",
	});
}

/** Five-minute recovery. Does not debit. Does not refund a live or terminal job. */
export async function sweepImportDispatches(
	env: Cloudflare.Env,
	now = new Date(),
): Promise<number> {
	const nowSec = unixNow(now);
	const due = await env.DB.prepare(
		`SELECT request_id, organization_id, user_id, job_type, content_hash,
		        payload_json, state, attempts, created_at, ledger_idempotency_key
		 FROM import_dispatch
		 WHERE state IN ('reserved', 'debited')
		   AND (next_attempt_at IS NULL OR next_attempt_at <= ?1)
		 LIMIT 20`,
	)
		.bind(nowSec)
		.all<DispatchRow>();
	let handled = 0;
	for (const row of due.results ?? []) {
		const age = nowSec - Number(row.created_at);
		if (age >= IMPORT_DISPATCH_DEADLINE_SECONDS) {
			await failPendingDispatch(env, row, nowSec);
			handled += 1;
			continue;
		}
		if (row.state !== "debited") continue;
		const payload = parsePayload(row.payload_json);
		if (!payload) continue;
		await dispatchNow(
			env,
			row.request_id,
			{ userId: row.user_id, organizationId: row.organization_id },
			payload,
			nowSec,
		);
		handled += 1;
	}
	return handled;
}
