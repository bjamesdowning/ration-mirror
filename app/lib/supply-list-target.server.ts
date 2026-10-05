import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { supplyList } from "~/db/schema";
import {
	InvalidListStateError,
	SupplyListNotFoundError,
} from "./supply-list-errors";
import {
	isSupplyListReachable,
	resolveSupplyListState,
	type SupplyListState,
} from "./supply-list-kinds";

export type SupplyListRow = typeof supplyList.$inferSelect;

export async function loadSupplyListRow(
	db: D1Database,
	organizationId: string,
	listId: string,
): Promise<SupplyListRow | null> {
	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function requireSupplyListTarget(
	db: D1Database,
	organizationId: string,
	listId: string,
	options: {
		multiListsEnabled: boolean;
		allowedStates?: SupplyListState[];
	},
): Promise<{ list: SupplyListRow; state: SupplyListState }> {
	const list = await loadSupplyListRow(db, organizationId, listId);
	if (!list) throw new SupplyListNotFoundError();

	const state = resolveSupplyListState(list);
	if (!isSupplyListReachable(state, options.multiListsEnabled)) {
		throw new SupplyListNotFoundError();
	}
	if (options.allowedStates && !options.allowedStates.includes(state)) {
		throw new InvalidListStateError(state);
	}
	return { list, state };
}

export async function requireSingletonLiveListId(
	db: D1Database,
	organizationId: string,
	listId: string,
	liveId: string,
): Promise<void> {
	if (listId === liveId) return;
	const existing = await loadSupplyListRow(db, organizationId, listId);
	if (!existing) throw new SupplyListNotFoundError();
	throw new InvalidListStateError(resolveSupplyListState(existing));
}
