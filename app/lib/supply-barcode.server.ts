import { searchFdcApiCandidates } from "./nutrition/fdc-api.server";

export async function lookupSupplyBarcode(
	env: Env,
	barcode: string,
): Promise<{ barcode: string; name: string; found: boolean }> {
	const trimmed = barcode.trim();
	const candidates = await searchFdcApiCandidates(env, trimmed);
	const first = candidates[0];
	if (first?.description) {
		return { barcode: trimmed, name: first.description, found: true };
	}
	return { barcode: trimmed, name: trimmed, found: false };
}
