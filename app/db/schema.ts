import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	// Extended fields
	settings: text("settings", { mode: "json" }).default("{}"), // Allergens, units, etc.
	credits: integer("credits").default(0),
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
});

export const account = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refresh_token_expires_at", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }),
	updatedAt: integer("updated_at", { mode: "timestamp" }),
});

	export const inventory = sqliteTable(
		"inventory",
		{
			id: text("id")
				.primaryKey()
				.$defaultFn(() => crypto.randomUUID()),
			userId: text("user_id")
				.notNull()
				.references(() => user.id),
			name: text("name").notNull(),
			quantity: integer("quantity").notNull(), // Normalised value
			unit: text("unit").notNull(), // kg, g, l, ml, piece
			tags: text("tags", { mode: "json" }).notNull().default("[]"), // Array of strings
			category: text("category").notNull().default("other"),
			status: text("status").notNull().default("stable"),
			expiresAt: integer("expires_at", { mode: "timestamp" }),
			createdAt: integer("created_at", { mode: "timestamp" })
				.notNull()
				.default(sql`(unixepoch())`),
			updatedAt: integer("updated_at", { mode: "timestamp" })
				.notNull()
				.default(sql`(unixepoch())`),
		},
		(table) => [
			index("inventory_user_idx").on(table.userId),
			index("inventory_category_idx").on(table.userId, table.category),
		],
	);

export const ledger = sqliteTable(
	"ledger",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		amount: integer("amount").notNull(), // Positive or negative
		reason: text("reason").notNull(), // "scan", "top-up", "correction"
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [index("ledger_user_idx").on(table.userId)],
);

export const meal = sqliteTable(
	"meal",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		name: text("name").notNull(),
		description: text("description"),
		directions: text("directions"),
		equipment: text("equipment", { mode: "json" }).default("[]"),
		servings: integer("servings").default(1),
		prepTime: integer("prep_time"),
		cookTime: integer("cook_time"),
		customFields: text("custom_fields", { mode: "json" }).default("{}"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("meal_user_idx").on(table.userId),
		index("meal_user_id_idx").on(table.userId, table.id),
	],
);

export const mealIngredient = sqliteTable(
	"meal_ingredient",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		mealId: text("meal_id")
			.notNull()
			.references(() => meal.id, { onDelete: "cascade" }),
		inventoryId: text("inventory_id").references(() => inventory.id, {
			onDelete: "set null",
		}),
		ingredientName: text("ingredient_name").notNull(),
		quantity: integer("quantity").notNull(),
		unit: text("unit").notNull(),
		isOptional: integer("is_optional", { mode: "boolean" }).default(false),
		orderIndex: integer("order_index").default(0),
	},
	(table) => [
		index("meal_ingredient_meal_idx").on(table.mealId),
		index("meal_ingredient_name_idx").on(table.ingredientName),
	],
);

export const mealTag = sqliteTable(
	"meal_tag",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		mealId: text("meal_id")
			.notNull()
			.references(() => meal.id, { onDelete: "cascade" }),
		tag: text("tag").notNull(),
	},
	(table) => [
		index("meal_tag_meal_idx").on(table.mealId),
		index("meal_tag_tag_idx").on(table.tag),
		unique("meal_tag_unique").on(table.mealId, table.tag),
	],
);
