import { log, redactId } from "./logging.server";
import type { CargoDeduction } from "./meals.server";

export const UNDO_TOKEN_TTL_SECONDS = 5;

export type UndoKind =
	| "cook"
	| "manifest_consume"
	| "manifest_cook"
	| "manifest_intake";

export interface UndoRecord {
	userId: string;
	organizationId: string;
	kind: UndoKind;
	deductions: CargoDeduction[];
	manifestEntryIds?: string[];
	planId?: string;
	/**
	 * Galley Cook→Manifest: delete these entry ids on undo after clearing cook
	 * state (auto-created plan rows only — never reused planned entries).
	 */
	deleteManifestEntryIds?: string[];
	/** Flight Recorder event ids to delete on undo. */
	eventIds?: string[];
	/**
	 * Private intake ids:
	 * - legacy `manifest_consume`: delete these rows
	 * - `manifest_intake`: void these rows (the newly written active intake)
	 */
	intakeIds?: string[];
	/**
	 * For `manifest_intake` edit undo: un-void this prior active row.
	 */
	restoreIntakeId?: string | null;
	/** Canonical nutrition operation that produced the intake mutation. */
	operationId?: string;
}

function undoKey(token: string): string {
	return `undo:${token}`;
}

export async function storeUndoToken(
	kv: KVNamespace,
	record: UndoRecord,
	token: string = crypto.randomUUID(),
): Promise<string> {
	await kv.put(undoKey(token), JSON.stringify(record), {
		expirationTtl: UNDO_TOKEN_TTL_SECONDS,
	});
	return token;
}

/**
 * Stores an undo token after a committed mutation. KV failures are logged and
 * swallowed so the client still receives success (cargo/plan already changed).
 */
export async function tryStoreUndoToken(
	kv: KVNamespace,
	record: UndoRecord,
	token?: string,
): Promise<string | undefined> {
	try {
		return await storeUndoToken(kv, record, token);
	} catch (kvErr) {
		log.warn("undo token store failed", {
			kind: record.kind,
			userId: redactId(record.userId),
			organizationId: redactId(record.organizationId),
			detail: kvErr instanceof Error ? kvErr.message : String(kvErr),
		});
		return undefined;
	}
}

/** Loads an undo token without consuming it, so a failed rollback remains retryable. */
export async function loadUndoToken(
	kv: KVNamespace,
	token: string,
	userId: string,
	organizationId: string,
): Promise<UndoRecord | null> {
	const raw = await kv.get(undoKey(token));
	if (!raw) return null;

	let record: UndoRecord;
	try {
		record = JSON.parse(raw) as UndoRecord;
	} catch {
		return null;
	}

	if (record.userId !== userId || record.organizationId !== organizationId) {
		return null;
	}

	return record;
}

export async function deleteUndoToken(
	kv: KVNamespace,
	token: string,
): Promise<void> {
	await kv.delete(undoKey(token));
}

export function mergeDeductions(
	target: CargoDeduction[],
	incoming: CargoDeduction[],
): void {
	for (const item of incoming) {
		const existing = target.find((d) => d.cargoId === item.cargoId);
		if (existing) {
			existing.quantity += item.quantity;
		} else {
			target.push({ ...item });
		}
	}
}
