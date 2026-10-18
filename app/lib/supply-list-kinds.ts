export const SUPPLY_LIST_NAME = "Supply";
export const SUPPLY_MULTI_LISTS_FLAG = "supply-multi-lists" as const;
export const SUPPLY_SAVED_ITEM_LIMIT = 500;
export const SUPPLY_LIST_NOTE_MAX = 280;

export const SUPPLY_LIST_KINDS = ["live", "saved", "template"] as const;
export type SupplyListKind = (typeof SUPPLY_LIST_KINDS)[number];

export const SUPPLY_LIST_STATES = [
	"live",
	"saved",
	"template",
	"archived",
] as const;
export type SupplyListState = (typeof SUPPLY_LIST_STATES)[number];

export const SUPPLY_CREATED_FROM = [
	"manual",
	"live_snapshot",
	"duplicate",
	"template",
	"receipt",
	"completed_trip",
] as const;
export type SupplyCreatedFrom = (typeof SUPPLY_CREATED_FROM)[number];

export function isSupplyListKind(value: unknown): value is SupplyListKind {
	return value === "live" || value === "saved" || value === "template";
}

export function resolveSupplyListState(list: {
	kind: string;
	archivedAt?: Date | number | string | null;
}): SupplyListState {
	if (list.archivedAt) return "archived";
	if (list.kind === "live") return "live";
	if (list.kind === "template") return "template";
	return "saved";
}

/** Only Live is shopped. Saved, template, and history pull into Live. */
export const LIVE_ONLY_CHECK_MESSAGE =
	"Only Live Supply can be checked off. Add it to Live instead.";
export const LIVE_ONLY_DOCK_MESSAGE =
	"Only Live Supply can be docked. Add items to Live instead.";

export const MUTABLE_SUPPLY_LIST_STATES = [
	"live",
	"saved",
	"template",
] as const satisfies readonly SupplyListState[];

export function canShopSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

export function canMutateSupplyItems(state: SupplyListState): boolean {
	return state === "live" || state === "saved" || state === "template";
}

export function canSyncSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

export function canSnoozeSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

export function canRenameSupplyList(state: SupplyListState): boolean {
	return state === "saved" || state === "template";
}

export function canDeleteSupplyList(state: SupplyListState): boolean {
	return state !== "live";
}

export function canArchiveSupplyList(state: SupplyListState): boolean {
	return state === "saved";
}

export function canDockSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

export function canResetPurchasedSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

/** Saved, template, and archived lists contribute rows to Live. Live does not. */
export function canAddToLive(state: SupplyListState): boolean {
	return state === "saved" || state === "template" || state === "archived";
}

export function canAddFromMealSupplyList(state: SupplyListState): boolean {
	return state === "live" || state === "saved";
}

/** Live, Saved, and Archived may have share tokens. Templates are never issued. */
export function canIssueSupplyShareToken(state: SupplyListState): boolean {
	return state === "live" || state === "saved" || state === "archived";
}

/** Shared purchased toggles exist only on Live. Every other share is read-only. */
export function canMutateSharedSupplyList(state: SupplyListState): boolean {
	return state === "live";
}

/** Flag-off clients may only address Live. Non-Live IDs 404, never leak as 403. */
export function isSupplyListReachable(
	state: SupplyListState,
	multiListsEnabled: boolean,
): boolean {
	return state === "live" || multiListsEnabled;
}

export function pickLegacyLiveCandidate<
	T extends {
		id: string;
		name: string;
		updatedAt: Date | number | string | null;
	},
>(lists: T[]): T {
	const time = (value: Date | number | string | null) => {
		if (value instanceof Date) return value.getTime();
		if (typeof value === "number") return value;
		if (typeof value === "string") {
			const parsed = Date.parse(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	};
	const named = lists
		.filter((list) => list.name === SUPPLY_LIST_NAME)
		.sort((a, b) => {
			const delta = time(b.updatedAt) - time(a.updatedAt);
			if (delta !== 0) return delta;
			return a.id.localeCompare(b.id);
		});
	if (named[0]) return named[0];
	return [...lists].sort((a, b) => {
		const delta = time(b.updatedAt) - time(a.updatedAt);
		if (delta !== 0) return delta;
		return a.id.localeCompare(b.id);
	})[0];
}

export function isUniqueConstraintError(error: unknown): boolean {
	const text =
		error instanceof Error
			? `${error.message} ${error.cause instanceof Error ? error.cause.message : String(error.cause ?? "")}`
			: String(error ?? "");
	return /unique constraint|SQLITE_CONSTRAINT/i.test(text);
}
