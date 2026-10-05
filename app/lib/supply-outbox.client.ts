const DB_NAME = "ration-supply-outbox";
const STORE = "operations";

export type SupplyOutboxOp = {
	operationId: string;
	listId: string;
	type: "add_item" | "update_item" | "delete_item" | "toggle_purchased";
	itemId?: string;
	payload?: Record<string, unknown>;
	baseRevision: number;
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: "operationId" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function enqueueSupplyOperation(
	op: SupplyOutboxOp,
): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		tx.objectStore(STORE).put(op);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function readSupplyOutbox(): Promise<SupplyOutboxOp[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, "readonly");
		const req = tx.objectStore(STORE).getAll();
		req.onsuccess = () => resolve(req.result as SupplyOutboxOp[]);
		req.onerror = () => reject(req.error);
	});
}

export async function removeSupplyOutboxOp(operationId: string): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		tx.objectStore(STORE).delete(operationId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function replaySupplyOutbox(): Promise<void> {
	if (!navigator.onLine) return;
	const ops = await readSupplyOutbox();
	const byList = new Map<string, SupplyOutboxOp[]>();
	for (const op of ops) {
		const group = byList.get(op.listId) ?? [];
		group.push(op);
		byList.set(op.listId, group);
	}
	for (const [listId, group] of byList) {
		const res = await fetch(`/api/supply-lists/${listId}/operations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				baseRevision: group[0]?.baseRevision ?? 0,
				operations: group,
			}),
		});
		if (!res.ok) continue;
		for (const op of group) {
			await removeSupplyOutboxOp(op.operationId);
		}
	}
}
