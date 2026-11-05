/**
 * Re-exports scale utilities for server use.
 * Pure logic lives in scale.ts so client components can import it.
 */
export {
	getScaleFactor,
	isCountUnit,
	roundShoppingCountQuantity,
	scaleCookQuantity,
	scaleQuantity,
	scaleQuantityExact,
} from "./scale";
