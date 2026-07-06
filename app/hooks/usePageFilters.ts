import { useSearchParams } from "react-router";
import { ITEM_DOMAINS } from "~/lib/domain";
import type { SupplySortMode } from "~/lib/supply-sort";
import {
	normalizeTagSlug,
	tagsFromSearchParam,
	tagsToSearchParam,
} from "~/lib/tags";

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

	const currentTags: string[] = supportsTags
		? tagsFromSearchParam(searchParams.get("tags"))
		: [];

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

	const toggleTag = (rawSlug: string) => {
		if (!supportsTags) return;
		const slug = normalizeTagSlug(rawSlug);
		if (!slug) return;

		const nextParams = new URLSearchParams(searchParams);
		const nextTags = currentTags.includes(slug)
			? currentTags.filter((t) => t !== slug)
			: [...currentTags, slug];

		if (nextTags.length === 0) {
			nextParams.delete("tags");
		} else {
			nextParams.set("tags", tagsToSearchParam(nextTags));
		}
		setSearchParams(nextParams);
	};

	const clearTags = () => {
		if (!supportsTags) return;
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("tags");
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
		nextParams.delete("tags");
		if (supportsSupplySort) {
			nextParams.delete("sort");
			nextParams.delete("hidePurchased");
		}
		setSearchParams(nextParams);
	};

	const hasActiveFilters =
		activeDomain !== "all" ||
		(currentTags.length > 0 && supportsTags) ||
		(supportsSupplySort && sortMode !== "alpha") ||
		(supportsSupplySort && hidePurchased) ||
		(extraActiveCheck?.() ?? false);

	return {
		activeDomain,
		currentTags,
		sortMode,
		hidePurchased,
		handleDomainChange,
		toggleTag,
		clearTags,
		handleSortChange,
		handleHidePurchasedChange,
		clearAllFilters,
		hasActiveFilters,
		searchParams,
		setSearchParams,
	};
}
