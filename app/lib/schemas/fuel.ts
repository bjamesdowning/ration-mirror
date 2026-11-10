import { z } from "zod";
import { isValidIanaTimeZone } from "~/lib/kitchen-time";

export const FUEL_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

export const FuelPhotoContentTypeSchema = z.enum([
	"image/jpeg",
	"image/png",
	"image/webp",
]);

export const FuelTimeZoneSchema = z
	.string()
	.trim()
	.min(1)
	.refine(isValidIanaTimeZone, "Must be an IANA time zone");

/** Digits only. GTIN-8, GTIN-12, GTIN-13, or GTIN-14. */
export const FuelBarcodeSchema = z
	.string()
	.trim()
	.regex(/^\d+$/, "Barcode must be digits")
	.refine(
		(value) => [8, 12, 13, 14].includes(value.length),
		"Barcode length must be 8, 12, 13, or 14",
	);

export function isFuelBarcode(value: string): boolean {
	return FuelBarcodeSchema.safeParse(value).success;
}
