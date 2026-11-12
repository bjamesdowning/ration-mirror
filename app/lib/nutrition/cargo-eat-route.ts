/**
 * Flag-on Cargo eat uses the existing Fuel route.
 * Flag off stays on Quick Eat.
 */

export function cargoEatPostPath(
	cargoId: string,
	planFuelActions: boolean,
): string {
	if (planFuelActions) {
		return `/api/mobile/v1/cargo/${cargoId}/add-to-fuel`;
	}
	return `/api/cargo/${cargoId}/quick-eat`;
}
