import { describe, expect, it } from "vitest";
import { orderOverflowActions } from "../detail-overflow";

describe("detail overflow order", () => {
	it("puts Delete then Edit ahead of cargo-only actions", () => {
		expect(
			orderOverflowActions([
				{ label: "Eat" },
				{ label: "Add to Galley" },
				{ label: "Edit" },
				{ label: "Mark Empty" },
				{ label: "Add to Supply" },
				{ label: "Delete" },
			]).map((action) => action.label),
		).toEqual([
			"Delete",
			"Edit",
			"Eat",
			"Add to Galley",
			"Mark Empty",
			"Add to Supply",
		]);
	});

	it("puts Delete then Edit ahead of meal-only actions", () => {
		expect(
			orderOverflowActions([
				{ label: "Cook meal" },
				{ label: "Add to Manifest" },
				{ label: "Add to Supply" },
				{ label: "Edit" },
				{ label: "Delete" },
			]).map((action) => action.label),
		).toEqual([
			"Delete",
			"Edit",
			"Cook meal",
			"Add to Manifest",
			"Add to Supply",
		]);
	});

	it("keeps a page-only action behind Delete and Edit", () => {
		expect(
			orderOverflowActions([
				{ label: "Eat" },
				{ label: "Edit" },
				{ label: "Mark Empty" },
				{ label: "Delete" },
			]).map((action) => action.label),
		).toEqual(["Delete", "Edit", "Eat", "Mark Empty"]);
		expect(
			orderOverflowActions([{ label: "Edit" }, { label: "Delete" }]).map(
				(action) => action.label,
			),
		).toEqual(["Delete", "Edit"]);
	});
});
