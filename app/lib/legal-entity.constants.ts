/** Canonical trader / data-controller identity for Mayutic (Ration operator). */
export const LEGAL_ENTITY = {
	businessName: "Mayutic",
	productName: "Ration",
	registeredBusinessNameNumber: "777497",
	address: {
		street: "6 Dundrum Wood, Ballinteer Road",
		locality: "Dublin 16",
		region: "Dublin",
		postalCode: "D16 N2P7",
		country: "IE",
	},
	formattedAddress:
		"6 Dundrum Wood, Ballinteer Road, Dublin 16, D16 N2P7, Ireland",
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
	const { businessName, address, registeredBusinessNameNumber, vatNumber } =
		LEGAL_ENTITY;
	const parts = [
		businessName,
		`${address.locality}, Ireland`,
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
		streetAddress: address.street,
		addressLocality: address.locality,
		addressRegion: address.region,
		postalCode: address.postalCode,
		addressCountry: address.country,
		name: formattedAddress,
	};
}
