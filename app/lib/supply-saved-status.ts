export type SavedLiveState = "none" | "on_live" | "in_cart";

export type SavedItemStatusInput = {
	name: string;
	quantity: number;
	unit: string;
	category?: string | null;
	inCargo?: number;
	lastDockedAt?: string | null;
	live?: {
		state: SavedLiveState;
		quantity?: number;
		unit?: string;
	};
};

export type AddToLiveCounts = {
	added: number;
	merged: number;
	skippedOnLive: number;
	skippedInCart: number;
	skippedInCargo: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function originLabel(createdFrom: string): string {
	switch (createdFrom) {
		case "live_snapshot":
		case "completed_trip":
			return "From Live";
		case "receipt":
			return "Receipt";
		case "duplicate":
		case "template":
			return "Duplicate";
		default:
			return "Manual";
	}
}

export function formatLastBought(
	iso: string | null | undefined,
	now = new Date(),
): string | null {
	if (!iso) return null;
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return null;
	const elapsed = now.getTime() - at.getTime();
	if (elapsed < 0) return "Last bought today";
	const days = Math.floor(elapsed / DAY_MS);
	if (days <= 0) return "Last bought today";
	if (days === 1) return "Last bought yesterday";
	if (days < 7) return `Last bought ${days} d ago`;
	if (days < 30) {
		const weeks = Math.max(1, Math.round(days / 7));
		return `Last bought ${weeks} wk ago`;
	}
	const months = Math.max(1, Math.round(days / 30));
	return `Last bought ${months} mo ago`;
}

export function formatSavedItemStatus(
	item: SavedItemStatusInput,
	now = new Date(),
): string {
	const parts: string[] = [];
	if ((item.inCargo ?? 0) > 0) parts.push(`In Cargo ${item.inCargo}`);
	const bought = formatLastBought(item.lastDockedAt, now);
	if (bought) parts.push(bought);
	if (item.live?.state === "on_live") {
		const qty = item.live.quantity ?? item.quantity;
		const unit = item.live.unit ?? item.unit;
		parts.push(`On Live ${qty} ${unit}`);
	}
	if (item.live?.state === "in_cart") parts.push("In cart");
	return parts.join(" · ");
}

export function formatAddToLiveCounts(counts: AddToLiveCounts): string {
	const parts: string[] = [];
	if (counts.added > 0) parts.push(`Added ${counts.added}`);
	if (counts.merged > 0) parts.push(`${counts.merged} extra`);
	if (counts.skippedOnLive > 0) {
		parts.push(`${counts.skippedOnLive} already on Live`);
	}
	if (counts.skippedInCart > 0) parts.push(`${counts.skippedInCart} in cart`);
	if (counts.skippedInCargo > 0)
		parts.push(`${counts.skippedInCargo} in Cargo`);
	return parts.join(" · ");
}

export function receiptListName(date: Date, storeName?: string | null): string {
	const label = date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
	const base = `Receipt · ${label}`;
	const store = storeName?.trim();
	return store ? `${base} · ${store}` : base;
}

export type OptimisticAddState = {
	phase: "idle" | "pending";
	status: SavedLiveState;
};

export function reduceOptimisticAdd(
	state: OptimisticAddState,
	event: "tap" | "success" | "undo" | "error",
): OptimisticAddState {
	if (event === "tap") {
		if (state.status !== "none" || state.phase === "pending") return state;
		return { phase: "pending", status: "on_live" };
	}
	if (event === "success") {
		return { phase: "idle", status: "on_live" };
	}
	if (event === "undo" || event === "error") {
		return { phase: "idle", status: "none" };
	}
	return state;
}

export type BulkSelectionState = {
	active: boolean;
	ids: string[];
};

export function reduceBulkSelection(
	state: BulkSelectionState,
	action:
		| { type: "start" }
		| { type: "cancel" }
		| { type: "toggle"; id: string }
		| { type: "clear" },
): BulkSelectionState {
	if (action.type === "start") return { active: true, ids: [] };
	if (action.type === "cancel" || action.type === "clear") {
		return { active: action.type === "cancel" ? false : state.active, ids: [] };
	}
	const has = state.ids.includes(action.id);
	return {
		active: true,
		ids: has
			? state.ids.filter((id) => id !== action.id)
			: [...state.ids, action.id],
	};
}

export function previewAddToLive(
	items: Array<SavedItemStatusInput & { id: string }>,
	mode: "missing" | "all" | "selected",
	selectedIds: string[] = [],
) {
	const chosen =
		mode === "selected"
			? items.filter((item) => selectedIds.includes(item.id))
			: items;
	const adding = [];
	let skippedOnLive = 0;
	let skippedInCart = 0;
	let skippedInCargo = 0;
	for (const item of chosen) {
		if (item.live?.state === "on_live") {
			skippedOnLive += 1;
			continue;
		}
		if (item.live?.state === "in_cart") {
			skippedInCart += 1;
			continue;
		}
		if (mode === "missing" && (item.inCargo ?? 0) >= item.quantity) {
			skippedInCargo += 1;
			continue;
		}
		adding.push(item);
	}
	return {
		adding,
		skippedOnLive,
		skippedInCart,
		skippedInCargo,
		needsReview: mode === "all" || adding.length > 25,
	};
}

export function sortForPullFrom<
	T extends {
		name: string;
		category?: string | null;
		lastDockedAt?: string | null;
	},
>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		const aTime = a.lastDockedAt
			? Date.parse(a.lastDockedAt)
			: Number.POSITIVE_INFINITY;
		const bTime = b.lastDockedAt
			? Date.parse(b.lastDockedAt)
			: Number.POSITIVE_INFINITY;
		if (aTime !== bTime) return aTime - bTime;
		const category = (a.category ?? "").localeCompare(b.category ?? "");
		if (category !== 0) return category;
		return a.name.localeCompare(b.name);
	});
}

export function pinnedListStorageKey(organizationId: string): string {
	return `supply.pinned.${organizationId}`;
}
