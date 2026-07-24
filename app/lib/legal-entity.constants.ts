/** Canonical trader / data-controller identity for Mayutic (Ration operator). */
export const LEGAL_ENTITY = {
	businessName: "Mayutic",
	productName: "Ration",
	registeredBusinessNameNumber: "777497",
	address: {
		locality: "Dublin",
		region: "Dublin",
		country: "IE",
	},
	/** Public geographic presence only — no street / postal code. */
	formattedAddress: "Ireland",
	emails: {
		legal: "legal@mayutic.com",
		support: "support@mayutic.com",
	},
	/** Populate when Revenue assigns an Irish VAT number (e.g. IE1234567T). */
	vatNumber: null as string | null,
	jurisdiction: "Ireland",
} as const;

/** One-line trader summary for footers and email signatures. */
export function traderFooterLine(): string {
	const {
		businessName,
		registeredBusinessNameNumber,
		vatNumber,
		jurisdiction,
	} = LEGAL_ENTITY;
	const parts = [
		businessName,
		jurisdiction,
		`RBN ${registeredBusinessNameNumber}`,
	];
	if (vatNumber) {
		parts.push(`VAT ${vatNumber}`);
	}
	return parts.join(" · ");
}

/** Postal address block for schema.org and structured exports. */
export function traderPostalAddressSchema() {
	const { address, formattedAddress } = LEGAL_ENTITY;
	return {
		"@type": "PostalAddress",
		addressLocality: address.locality,
		addressRegion: address.region,
		addressCountry: address.country,
		name: formattedAddress,
	};
}
