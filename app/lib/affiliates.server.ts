export const AFFILIATE_LINKS = {
	helloFresh: "https://www.hellofresh.com/",
	amazonFresh: "https://www.amazon.com/fmc/storefront",
	walmartGrocery: "https://www.walmart.com/cp/grocery/976759",
	instacart: "https://www.instacart.com/",
} as const;

export function getAffiliateLink(key: keyof typeof AFFILIATE_LINKS) {
	return AFFILIATE_LINKS[key];
}
