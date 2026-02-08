import { useSearchParams } from "react-router";
import { ITEM_DOMAINS } from "~/lib/domain";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

interface UsePageFiltersOptions {
	supportsTags?: boolean;
	extraActiveCheck?: () => boolean;
}

export function usePageFilters(options: UsePageFiltersOptions = {}) {
	const { supportsTags = true, extraActiveCheck } = options;
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

	const clearAllFilters = () => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("domain");
		nextParams.delete("tag");
		setSearchParams(nextParams);
	};

	const hasActiveFilters =
		activeDomain !== "all" ||
		(!!currentTag && supportsTags) ||
		(extraActiveCheck?.() ?? false);

	return {
		activeDomain,
		currentTag,
		handleDomainChange,
		handleTagChange,
		clearAllFilters,
		hasActiveFilters,
		searchParams,
		setSearchParams,
	};
}
