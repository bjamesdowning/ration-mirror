/**
 * Utility to parse complex form data into objects/arrays.
 * Supports nested syntax like "ingredients[0].name".
 */
export function parseFormData(formData: FormData) {
	const obj: Record<string, unknown> = {};
	const MAX_ARRAY_SIZE = 100; // Prevent DDoS/Memory exhaustion

	for (const [key, value] of formData.entries()) {
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
