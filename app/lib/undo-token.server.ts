import type { CargoDeduction } from "./meals.server";

export const UNDO_TOKEN_TTL_SECONDS = 5;

export type UndoKind = "cook" | "manifest_consume";

export interface UndoRecord {
	userId: string;
	organizationId: string;
	kind: UndoKind;
	deductions: CargoDeduction[];
	manifestEntryIds?: string[];
	planId?: string;
}

function undoKey(token: string): string {
	return `undo:${token}`;
}

export async function storeUndoToken(
	kv: KVNamespace,
	record: UndoRecord,
): Promise<string> {
	const token = crypto.randomUUID();
	await kv.put(undoKey(token), JSON.stringify(record), {
		expirationTtl: UNDO_TOKEN_TTL_SECONDS,
	});
	return token;
}

/** Loads and deletes a one-time undo token; returns null if missing, expired, or unauthorized. */
export async function consumeUndoToken(
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

	await kv.delete(undoKey(token));
	return record;
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
