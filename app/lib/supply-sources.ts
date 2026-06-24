export interface SupplyItemSource {
	id: string | null;
	name: string;
}

export interface SupplyItemSourceInput {
	sourceMealName?: string | null;
	sourceMealNames?: string[] | null;
	sourceMealSources?: { id: string; name: string }[];
}

/** Resolves meal source metadata for a supply list item (desktop line + mobile sheet). */
export function resolveSupplyItemSources({
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemSourceInput): SupplyItemSource[] {
	if (Array.isArray(sourceMealSources) && sourceMealSources.length > 0) {
		return sourceMealSources.map((s) => ({ id: s.id, name: s.name }));
	}
	if (Array.isArray(sourceMealNames) && sourceMealNames.length > 0) {
		return sourceMealNames.map((name) => ({ id: null, name }));
	}
	if (sourceMealName) {
		return [{ id: null, name: sourceMealName }];
	}
	return [];
}
