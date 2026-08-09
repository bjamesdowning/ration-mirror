import type { Config } from "drizzle-kit";

/**
 * Nutrition reference DB (ration-nutrition) — separate from main app D1.
 * Schema mirror: nutrition-db/schema.ts
 * SQL source of truth: nutrition-db/schema.sql + nutrition-db/migrations/
 *
 * Do not clear/refill the active production nutrition binding; promote via
 * new verified D1 + binding change after release checks.
 */
export default {
	schema: "./nutrition-db/schema.ts",
	out: "./nutrition-db/drizzle",
	dialect: "sqlite",
} satisfies Config;
