/**
 * Person-scoped day list. Default is one timed list.
 * Slots reuse the row's slotType. A null or unknown slot stays in Other.
 */

export const DIARY_LAYOUTS = ["timeline", "slots"] as const;

export type DiaryLayout = (typeof DIARY_LAYOUTS)[number];

export const DEFAULT_DIARY_LAYOUT: DiaryLayout = "timeline";

const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

const SLOT_LABELS: Record<(typeof SLOT_ORDER)[number], string> = {
	breakfast: "Breakfast",
	lunch: "Lunch",
	dinner: "Dinner",
	snack: "Snack",
	other: "Other",
};

export function normalizeDiaryLayout(value: unknown): DiaryLayout {
	return value === "slots" ? "slots" : DEFAULT_DIARY_LAYOUT;
}

/** The header and Settings row exist only while the parent flag is on. */
export function diaryLayoutControlVisible(fastLogEnabled: boolean): boolean {
	return fastLogEnabled;
}

export function applyDiaryLayout<T extends { diaryLayout?: DiaryLayout }>(
	settings: T,
	layout: DiaryLayout,
): T {
	return { ...settings, diaryLayout: layout };
}

type DiaryRow = {
	id: string;
	occurredAt?: string | null;
	slotType?: string | null;
};

export type DiaryLayoutGroup<T> = {
	id: string;
	label: string | null;
	rows: T[];
};

function byTimeThenId(a: DiaryRow, b: DiaryRow): number {
	const left = a.occurredAt ?? "";
	const right = b.occurredAt ?? "";
	if (left !== right) return left < right ? -1 : 1;
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

function slotKey(
	slotType: string | null | undefined,
): (typeof SLOT_ORDER)[number] {
	if (
		slotType === "breakfast" ||
		slotType === "lunch" ||
		slotType === "dinner" ||
		slotType === "snack"
	) {
		return slotType;
	}
	return "other";
}

/**
 * Flag off returns the rows unchanged. Timeline sorts by occurredAt, then id.
 * Slots keeps that order inside breakfast, lunch, dinner, snack, and Other.
 */
export function presentDiaryRows<T extends DiaryRow>(
	rows: readonly T[],
	options: { controlVisible: boolean; layout: DiaryLayout },
): DiaryLayoutGroup<T>[] {
	if (!options.controlVisible) {
		return [{ id: "all", label: null, rows: [...rows] }];
	}
	const ordered = [...rows].sort(byTimeThenId);
	if (options.layout !== "slots") {
		return [{ id: "timeline", label: null, rows: ordered }];
	}
	const buckets = new Map<(typeof SLOT_ORDER)[number], T[]>();
	for (const row of ordered) {
		const key = slotKey(row.slotType);
		const bucket = buckets.get(key) ?? [];
		bucket.push(row);
		buckets.set(key, bucket);
	}
	return SLOT_ORDER.flatMap((key) => {
		const group = buckets.get(key);
		if (!group || group.length === 0) return [];
		return [{ id: key, label: SLOT_LABELS[key], rows: group }];
	});
}
