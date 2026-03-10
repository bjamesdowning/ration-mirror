/**
 * Returns a router-safe action path from an HTML form element.
 *
 * `HTMLFormElement.action` is a DOM property that always returns an absolute
 * URL (e.g. "https://example.com/api/meals/123/cook"). Passing that absolute
 * URL to React Router's `fetcher.submit({ action })` causes the router to fail
 * matching the route, producing a not-found 400/404 response.
 *
 * This helper reads the `action` *attribute* value via `getAttribute("action")`
 * which returns the relative path as written in JSX (e.g. "/api/meals/123/cook").
 * If the attribute is missing or empty it falls back to `"/"` rather than
 * throwing, so callers never need a try/catch.
 */
export function getFormActionPath(form: HTMLFormElement): string {
	return form.getAttribute("action") ?? "/";
}

/**
 * Fields that should be parsed as comma-separated arrays.
 * These are typically text inputs where users enter multiple values.
 */
const COMMA_SEPARATED_ARRAY_FIELDS = new Set(["tags", "equipment"]);

/**
 * Utility to parse complex form data into objects/arrays.
 * Supports nested syntax like "ingredients[0].name".
 * Also supports comma-separated values for specific array fields.
 */
export function parseFormData(formData: FormData) {
	const obj: Record<string, unknown> = {};
	const MAX_ARRAY_SIZE = 100; // Prevent DDoS/Memory exhaustion

	for (const [key, value] of formData.entries()) {
		// Handle comma-separated array fields
		if (COMMA_SEPARATED_ARRAY_FIELDS.has(key)) {
			const stringValue = typeof value === "string" ? value : "";
			obj[key] = stringValue
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
			continue;
		}

		// Handle simple fields
		if (!key.includes("[")) {
			obj[key] = value;
			continue;
		}

		// Handle array fields: root[index].field
		const match = key.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
		if (match) {
			const [_, root, indexStr, field] = match;
			const index = Number.parseInt(indexStr, 10);

			if (index >= MAX_ARRAY_SIZE) {
				throw new Error(`Array index overflow for field: ${root}`);
			}

			if (!obj[root]) obj[root] = [];
			const rootArray = obj[root] as Record<string, unknown>[];

			if (!rootArray[index]) rootArray[index] = {};
			rootArray[index][field] = value;
			continue;
		}

		// Fallback for unexpected keys
		obj[key] = value;
	}

	// Filter out empty slots created by parsing
	if (Array.isArray(obj.ingredients)) {
		obj.ingredients = obj.ingredients.filter(
			(i) => i !== null && typeof i === "object",
		);
	}

	return obj;
}
