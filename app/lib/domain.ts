export const ITEM_DOMAINS = ["food", "household", "alcohol"] as const;
export type ItemDomain = (typeof ITEM_DOMAINS)[number];

export const DOMAIN_LABELS: Record<ItemDomain, string> = {
	food: "Food",
	household: "Household",
	alcohol: "Alcohol",
};

export const DOMAIN_ICONS: Record<ItemDomain, string> = {
	food: "🥩",
	household: "🧹",
	alcohol: "🍸",
};
