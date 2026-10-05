import {
	canAddFromMealSupplyList,
	canArchiveSupplyList,
	canDeleteSupplyList,
	canDockSupplyList,
	canMutateSupplyItems,
	canRenameSupplyList,
	canResetPurchasedSupplyList,
	canShopSupplyList,
	canSnoozeSupplyList,
	canSyncSupplyList,
	resolveSupplyListState,
	type SupplyListState,
} from "./supply-list-kinds";

export function supplyListCapabilities(state: SupplyListState) {
	return {
		canShop: canShopSupplyList(state),
		canMutate: canMutateSupplyItems(state),
		canSync: canSyncSupplyList(state),
		canSnooze: canSnoozeSupplyList(state),
		canRename: canRenameSupplyList(state),
		canDelete: canDeleteSupplyList(state),
		canArchive: canArchiveSupplyList(state),
		canDock: canDockSupplyList(state),
		canResetPurchased: canResetPurchasedSupplyList(state),
		canAddFromMeal: canAddFromMealSupplyList(state),
	};
}

export function supplyListEtag(revision: number): string {
	return `"${revision}"`;
}

export function parseIfNoneMatch(header: string | null): number | null {
	if (!header) return null;
	const match = header.match(/"?(\d+)"?/);
	if (!match?.[1]) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

export function catalogSummaryFromRow(row: {
	id: string;
	name: string;
	kind: string;
	archivedAt: Date | null;
	createdFrom: string;
	storeProfileId: string | null;
	revision: number;
	updatedAt: Date;
	itemCount?: number;
	purchasedCount?: number;
	storeName?: string | null;
}) {
	const state = resolveSupplyListState(row);
	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		state,
		archivedAt: row.archivedAt,
		createdFrom: row.createdFrom,
		storeProfileId: row.storeProfileId,
		storeName: row.storeName ?? null,
		itemCount: row.itemCount ?? 0,
		purchasedCount: row.purchasedCount ?? 0,
		revision: row.revision,
		updatedAt: row.updatedAt,
		capabilities: supplyListCapabilities(state),
	};
}
