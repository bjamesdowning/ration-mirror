import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(), // Clerk ID
	email: text("email").notNull(),
	settings: text("settings", { mode: "json" }).notNull().default("{}"), // Allergens, units, etc.
	credits: integer("credits").notNull().default(0),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export const inventory = sqliteTable(
	"inventory",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id").notNull(),
		name: text("name").notNull(),
		quantity: integer("quantity").notNull(), // Normalised value
		unit: text("unit").notNull(), // kg, g, l, ml, piece
		tags: text("tags", { mode: "json" }).notNull().default("[]"), // Array of strings
		expiresAt: integer("expires_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [index("inventory_user_idx").on(table.userId)],
);

export const ledger = sqliteTable(
	"ledger",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id").notNull(),
		amount: integer("amount").notNull(), // Positive or negative
		reason: text("reason").notNull(), // "scan", "top-up", "correction"
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [index("ledger_user_idx").on(table.userId)],
);
