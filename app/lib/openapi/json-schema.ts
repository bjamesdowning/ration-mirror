import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Convert a Zod schema to an OpenAPI 3.1-compatible JSON Schema object. */
export function zodOpenApiComponent(name: string, schema: z.ZodType) {
	// zod-to-json-schema targets Zod 3 types; runtime is compatible with Zod 4.
	const raw = zodToJsonSchema(schema as never, {
		name,
		target: "openApi3",
		$refStrategy: "none",
		effectStrategy: "input",
	}) as Record<string, unknown>;

	const { $schema: _schema, ...component } = raw;
	return component;
}

export function ref(name: string) {
	return { $ref: `#/components/schemas/${name}` };
}
