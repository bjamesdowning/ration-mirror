import {
	computeDaysUntilExpiry,
	expiryDisplayStatus,
	toExpiryDateISO,
} from "../cargo-utils";

export type ExpiryCargoRow = {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	expiresAt: Date | null;
};

export type MappedExpiryCargoItem = {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	expiresAt: Date | null;
	expiresOn: string | null;
	daysUntilExpiry: number | null;
	status: "expired" | "today" | "soon" | null;
};

export function mapExpiryCargoItems(
	items: ExpiryCargoRow[],
	now = new Date(),
): MappedExpiryCargoItem[] {
	return items.map((item) => {
		const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
		if (!expiresAt) {
			return {
				id: item.id,
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				expiresAt: item.expiresAt,
				expiresOn: null,
				daysUntilExpiry: null,
				status: null,
			};
		}
		return {
			id: item.id,
			name: item.name,
			quantity: item.quantity,
			unit: item.unit,
			expiresAt: item.expiresAt,
			expiresOn: toExpiryDateISO(expiresAt),
			daysUntilExpiry: computeDaysUntilExpiry(expiresAt, now),
			status: expiryDisplayStatus(expiresAt, now),
		};
	});
}
