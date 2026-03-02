import { describe, expect, it } from "vitest";
import { parseFormData } from "~/lib/form-utils";

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
