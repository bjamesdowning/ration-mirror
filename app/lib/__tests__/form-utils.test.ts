import { describe, expect, it } from "vitest";
import { getFormActionPath, parseFormData } from "~/lib/form-utils";

function makeFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.append(key, value);
	}
	return fd;
}

describe("parseFormData — simple fields", () => {
	it("extracts simple string fields", () => {
		const fd = makeFormData({ name: "apple", quantity: "2" });
		const result = parseFormData(fd);
		expect(result.name).toBe("apple");
		expect(result.quantity).toBe("2");
	});
});

describe("parseFormData — comma-separated array fields", () => {
	it("splits 'tags' into an array", () => {
		const fd = makeFormData({ tags: "organic, local, fresh" });
		const result = parseFormData(fd);
		expect(result.tags).toEqual(["organic", "local", "fresh"]);
	});

	it("splits 'equipment' into an array", () => {
		const fd = makeFormData({ equipment: "pan,oven, blender" });
		const result = parseFormData(fd);
		expect(result.equipment).toEqual(["pan", "oven", "blender"]);
	});

	it("filters empty entries from comma-separated fields", () => {
		const fd = makeFormData({ tags: "organic,,local," });
		const result = parseFormData(fd);
		expect(result.tags).toEqual(["organic", "local"]);
	});

	it("returns empty array when tags field is empty", () => {
		const fd = makeFormData({ tags: "" });
		const result = parseFormData(fd);
		expect(result.tags).toEqual([]);
	});
});

describe("parseFormData — nested array syntax", () => {
	it("parses ingredients[0].name correctly", () => {
		const fd = makeFormData({
			"ingredients[0].name": "flour",
			"ingredients[0].quantity": "200",
			"ingredients[1].name": "eggs",
		});
		const result = parseFormData(fd);
		const ingredients = result.ingredients as Array<Record<string, unknown>>;
		expect(ingredients[0].name).toBe("flour");
		expect(ingredients[0].quantity).toBe("200");
		expect(ingredients[1].name).toBe("eggs");
	});

	it("filters out sparse null slots from array parsing", () => {
		// When index 1 is set but 0 is never set, slot 0 should be filtered
		const fd = makeFormData({ "ingredients[1].name": "eggs" });
		const result = parseFormData(fd);
		const ingredients = result.ingredients as Array<Record<string, unknown>>;
		expect(ingredients.every((i) => i !== null && typeof i === "object")).toBe(
			true,
		);
	});
});

describe("parseFormData — MAX_ARRAY_SIZE overflow", () => {
	it("throws when array index >= 100", () => {
		const fd = makeFormData({ "ingredients[100].name": "overflow" });
		expect(() => parseFormData(fd)).toThrow("Array index overflow");
	});

	it("does not throw for index 99 (last valid)", () => {
		const fd = makeFormData({ "ingredients[99].name": "last" });
		expect(() => parseFormData(fd)).not.toThrow();
	});
});

/**
 * Regression tests for getFormActionPath.
 *
 * Background: `HTMLFormElement.action` (the DOM *property*) always returns an
 * absolute URL, e.g. "https://example.com/api/meals/abc/cook". Passing that
 * absolute URL to React Router's `fetcher.submit({ action })` bypasses route
 * matching and produces a not-found 400/404 response.
 *
 * `getFormActionPath` reads the *attribute* value instead, which is the
 * relative path as written in JSX (e.g. "/api/meals/abc/cook"), keeping React
 * Router happy.
 */
describe("getFormActionPath — router-safe action extraction", () => {
	// In the node test environment there is no real DOM, so we stub just the
	// `.getAttribute()` method — the only thing getFormActionPath calls.
	function makeForm(actionAttr?: string): HTMLFormElement {
		return {
			getAttribute: (name: string) =>
				name === "action" ? (actionAttr ?? null) : null,
		} as unknown as HTMLFormElement;
	}

	it("returns a relative path unchanged — the safe cook action case", () => {
		const mealId = "abc123";
		const form = makeForm(`/api/meals/${mealId}/cook`);
		expect(getFormActionPath(form)).toBe(`/api/meals/${mealId}/cook`);
	});

	it("does NOT return an absolute URL that would break React Router matching", () => {
		// HTMLFormElement.action (DOM *property*) resolves to an absolute URL in a
		// real browser (e.g. "https://ration.app/api/meals/abc123/cook"). Our
		// helper reads the *attribute* value instead, ensuring the result is always
		// a relative path that React Router can match.
		const form = makeForm("/api/meals/abc123/cook");
		const result = getFormActionPath(form);
		expect(result).not.toMatch(/^https?:\/\//);
	});

	it("returns '/' as safe fallback when action attribute is absent", () => {
		const form = makeForm();
		expect(getFormActionPath(form)).toBe("/");
	});

	it("preserves query params in the action attribute", () => {
		const form = makeForm("/api/meals/abc123/cook?debug=1");
		expect(getFormActionPath(form)).toBe("/api/meals/abc123/cook?debug=1");
	});

	it("preserves a relative path that has no leading slash", () => {
		const form = makeForm("api/meals/abc123/cook");
		expect(getFormActionPath(form)).toBe("api/meals/abc123/cook");
	});
});

describe("parseFormData — ingredients filtering", () => {
	it("removes null/non-object entries from ingredients array", () => {
		const fd = makeFormData({
			"ingredients[0].name": "flour",
		});
		const result = parseFormData(fd);
		const ingredients = result.ingredients as unknown[];
		expect(Array.isArray(ingredients)).toBe(true);
		for (const item of ingredients) {
			expect(item).not.toBeNull();
			expect(typeof item).toBe("object");
		}
	});
});
