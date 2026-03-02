import { describe, expect, it } from "vitest";
import {
	type ConfirmOptions,
	isTypedConfirmMatch,
} from "~/lib/confirm-context";

// ---------------------------------------------------------------------------
// isTypedConfirmMatch
// ---------------------------------------------------------------------------

describe("isTypedConfirmMatch", () => {
	it("returns true when no requireTyped gate is set", () => {
		expect(isTypedConfirmMatch(undefined, "")).toBe(true);
		expect(isTypedConfirmMatch(undefined, "anything")).toBe(true);
	});

	it("returns true when typed value exactly matches the required word", () => {
		expect(isTypedConfirmMatch("delete", "delete")).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(isTypedConfirmMatch("delete", "DELETE")).toBe(true);
		expect(isTypedConfirmMatch("delete", "Delete")).toBe(true);
		expect(isTypedConfirmMatch("DELETE", "delete")).toBe(true);
	});

	it("returns false when the typed value is empty", () => {
		expect(isTypedConfirmMatch("delete", "")).toBe(false);
	});

	it("returns false when the typed value is a partial match", () => {
		expect(isTypedConfirmMatch("delete", "delet")).toBe(false);
		expect(isTypedConfirmMatch("delete", "deleted")).toBe(false);
	});

	it("returns false when the typed value is an unrelated word", () => {
		expect(isTypedConfirmMatch("delete", "confirm")).toBe(false);
	});

	it("returns false when typed value has surrounding whitespace", () => {
		expect(isTypedConfirmMatch("delete", " delete ")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// ConfirmOptions shape — compile-time coverage via typed assertions
// ---------------------------------------------------------------------------

describe("ConfirmOptions shape", () => {
	it("accepts consequences and requireTyped as optional fields", () => {
		const minimal: ConfirmOptions = {
			title: "Are you sure?",
			message: "This cannot be undone.",
		};
		expect(minimal.consequences).toBeUndefined();
		expect(minimal.requireTyped).toBeUndefined();
	});

	it("accepts a full options object with all new fields", () => {
		const full: ConfirmOptions = {
			title: "Delete your account permanently?",
			message: "There is no recovery path.",
			consequences: [
				"All inventory items",
				"Your remaining credit balance (non-refundable)",
			],
			requireTyped: "delete",
			confirmLabel: "Delete My Account",
			cancelLabel: "Cancel",
			variant: "danger",
		};
		expect(full.consequences).toHaveLength(2);
		expect(full.requireTyped).toBe("delete");
	});

	it("consequences array is preserved as-is", () => {
		const items = ["Item A", "Item B", "Item C"];
		const opts: ConfirmOptions = {
			title: "t",
			message: "m",
			consequences: items,
		};
		expect(opts.consequences).toEqual(items);
	});
});
