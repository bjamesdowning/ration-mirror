import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { cargo } from "~/db/schema";
import { requireAdmin } from "~/lib/auth.server";
import { upsertCargoVectors } from "~/lib/vector.server";
import type { Route } from "./+types/admin.backfill-vectors";

/**
 * POST /api/admin/backfill-vectors — One-time backfill of Vectorize embeddings
 * for existing cargo. Admin-only. Use after Vectorize integration to populate
 * the index for pre-existing cargo.
 */
export async function action({ request, context }: Route.ActionArgs) {
	await requireAdmin(context, request);

	const env = context.cloudflare.env;
	if (!env.VECTORIZE || !env.AI) {
		throw data({ error: "Vectorize or AI not configured" }, { status: 503 });
	}

	const db = drizzle(env.DB);

	// Fetch all cargo items
	const allCargo = await db
		.select({
			id: cargo.id,
			name: cargo.name,
			domain: cargo.domain,
			organizationId: cargo.organizationId,
		})
		.from(cargo);

	// Group by org for batched upserts
	const byOrg = new Map<
		string,
		Array<{ id: string; name: string; domain: string }>
	>();
	for (const item of allCargo) {
		const list = byOrg.get(item.organizationId) ?? [];
		list.push({
			id: item.id,
			name: item.name,
			domain: item.domain ?? "food",
		});
		byOrg.set(item.organizationId, list);
	}

	let upserted = 0;
	for (const [orgId, items] of byOrg) {
		await upsertCargoVectors(env, orgId, items);
		upserted += items.length;
	}

	return { success: true, upserted };
}
