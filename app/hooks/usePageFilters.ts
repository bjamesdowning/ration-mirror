import { useSearchParams } from "react-router";
import { ITEM_DOMAINS } from "~/lib/domain";
import type { SupplySortMode } from "~/lib/supply-sort";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

const SUPPLY_SORT_MODES: SupplySortMode[] = ["alpha", "unpurchased", "added"];

interface UsePageFiltersOptions {
	supportsTags?: boolean;
	supportsSupplySort?: boolean;
	extraActiveCheck?: () => boolean;
}

export function usePageFilters(options: UsePageFiltersOptions = {}) {
	const {
		supportsTags = true,
		supportsSupplySort = false,
		extraActiveCheck,
	} = options;
	const [searchParams, setSearchParams] = useSearchParams();

	const activeDomainParam = searchParams.get("domain") || "all";
	const activeDomain: ItemDomain | "all" = ITEM_DOMAINS.includes(
		activeDomainParam as ItemDomain,
	)
		? (activeDomainParam as ItemDomain)
		: "all";

	const currentTag: string | undefined = supportsTags
		? searchParams.get("tag") || undefined
		: undefined;

	const sortParam = searchParams.get("sort") || "alpha";
	const sortMode: SupplySortMode = SUPPLY_SORT_MODES.includes(
		sortParam as SupplySortMode,
	)
		? (sortParam as SupplySortMode)
		: "alpha";

	const hidePurchased = supportsSupplySort
		? searchParams.get("hidePurchased") === "1"
		: false;

	const handleDomainChange = (nextDomain: ItemDomain | "all") => {
		const nextParams = new URLSearchParams(searchParams);
		if (nextDomain === "all") {
			nextParams.delete("domain");
		} else {
			nextParams.set("domain", nextDomain);
		}
		setSearchParams(nextParams);
	};

	const handleTagChange = (tag: string) => {
		if (!supportsTags) return;
		const nextParams = new URLSearchParams(searchParams);
		if (tag) {
			nextParams.set("tag", tag);
		} else {
			nextParams.delete("tag");
		}
		setSearchParams(nextParams);
	};

	const handleSortChange = (nextSort: SupplySortMode) => {
		if (!supportsSupplySort) return;
		const nextParams = new URLSearchParams(searchParams);
		if (nextSort === "alpha") {
			nextParams.delete("sort");
		} else {
			nextParams.set("sort", nextSort);
		}
		setSearchParams(nextParams);
	};

	const handleHidePurchasedChange = (hide: boolean) => {
		if (!supportsSupplySort) return;
		const nextParams = new URLSearchParams(searchParams);
		if (hide) {
			nextParams.set("hidePurchased", "1");
		} else {
			nextParams.delete("hidePurchased");
		}
		setSearchParams(nextParams);
	};

	const clearAllFilters = () => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("domain");
		nextParams.delete("tag");
		if (supportsSupplySort) {
			nextParams.delete("sort");
			nextParams.delete("hidePurchased");
		}
		setSearchParams(nextParams);
	};

	const hasActiveFilters =
		activeDomain !== "all" ||
		(!!currentTag && supportsTags) ||
		(supportsSupplySort && sortMode !== "alpha") ||
		(supportsSupplySort && hidePurchased) ||
		(extraActiveCheck?.() ?? false);

	return {
		activeDomain,
		currentTag,
		sortMode,
		hidePurchased,
		handleDomainChange,
		handleTagChange,
		handleSortChange,
		handleHidePurchasedChange,
		clearAllFilters,
		hasActiveFilters,
		searchParams,
		setSearchParams,
	};
}
