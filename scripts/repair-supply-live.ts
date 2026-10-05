#!/usr/bin/env bun
/**
 * Idempotent Live Supply repair — run with the flag off after deploying
 * non-destructive ensureLiveSupplyList. Reports assigned Live row and quota slots.
 */
import { ensureLiveSupplyList } from "../app/lib/supply.server";

const orgId = process.argv[2];
if (!orgId) {
	console.error("Usage: bun scripts/repair-supply-live.ts <organizationId>");
	process.exit(1);
}

const db = (globalThis as { DB?: D1Database }).DB;
if (!db) {
	console.error("Bind DB before running this repair script.");
	process.exit(1);
}

const list = await ensureLiveSupplyList(db, orgId);
console.log(
	JSON.stringify(
		{
			organizationId: orgId,
			liveId: list?.id,
			name: list?.name,
			kind: list?.kind,
			itemCount: list?.items.length ?? 0,
		},
		null,
		2,
	),
);
