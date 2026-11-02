import { z } from "zod";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID field for MCP tool schemas.
 * `format: uuid` plus a shared `$ref` id — no per-field UUID regex in the catalog.
 */
export const UuidSchema = z
	.string()
	.meta({
		id: "uuid",
		format: "uuid",
		description: "UUID",
	})
	.check((ctx) => {
		const value = typeof ctx.value === "string" ? ctx.value : "";
		if (!UUID_RE.test(value)) {
			ctx.issues.push({
				code: "custom",
				message: "Invalid UUID",
				input: ctx.value,
			});
		}
	});

/** Common units live on the field so clients that hide ration://units can still send them. */
export const UNIT_FIELD_DESCRIPTION =
	"Unit. Common values: g, kg, ml, l, unit. Aliases such as grams, litres, and cups are normalized server-side. ration://units lists the rest and is optional.";
