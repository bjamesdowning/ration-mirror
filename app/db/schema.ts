import { relations, sql } from "drizzle-orm";
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
});

export const userRelations = relations(user, ({ many }) => ({
	members: many(member),
	sessions: many(session),
}));

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
	// Active organization for group switching
	activeOrganizationId: text("active_organization_id").references(
		() => organization.id,
	),
});

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

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

// Better Auth Organization Plugin Tables

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	logo: text("logo"),
	metadata: text("metadata", { mode: "json" }),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	// Extended field for credit pooling
	credits: integer("credits").default(0).notNull(),
});

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	inventory: many(inventory),
	meals: many(meal),
	groceryLists: many(groceryList),
}));

export const member = sqliteTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull(), // 'owner' | 'admin' | 'member'
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("member_org_idx").on(table.organizationId),
		index("member_user_idx").on(table.userId),
		unique("member_org_user_unique").on(table.organizationId, table.userId),
	],
);

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(), // Shareable link token
		role: text("role").notNull(), // 'admin' | 'member'
		status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'canceled'
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("invitation_org_idx").on(table.organizationId),
		index("invitation_token_idx").on(table.token),
	],
);

export const inventory = sqliteTable(
	"inventory",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
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
		index("inventory_org_idx").on(table.organizationId),
		index("inventory_category_idx").on(table.organizationId, table.category),
	],
);

export const inventoryRelations = relations(inventory, ({ one }) => ({
	organization: one(organization, {
		fields: [inventory.organizationId],
		references: [organization.id],
	}),
}));

export const ledger = sqliteTable(
	"ledger",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id), // Track which user triggered the transaction
		amount: integer("amount").notNull(), // Positive or negative
		reason: text("reason").notNull(), // "scan", "top-up", "correction"
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("ledger_org_idx").on(table.organizationId),
		index("ledger_user_idx").on(table.userId),
	],
);

export const meal = sqliteTable(
	"meal",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		directions: text("directions"),
		equipment: text("equipment", { mode: "json" })
			.$type<string[]>()
			.default([]),
		servings: integer("servings").default(1),
		prepTime: integer("prep_time"),
		cookTime: integer("cook_time"),
		customFields: text("custom_fields", { mode: "json" })
			.$type<Record<string, any>>()
			.default({}),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("meal_org_idx").on(table.organizationId),
		index("meal_org_id_idx").on(table.organizationId, table.id),
	],
);

export const mealRelations = relations(meal, ({ one, many }) => ({
	organization: one(organization, {
		fields: [meal.organizationId],
		references: [organization.id],
	}),
	ingredients: many(mealIngredient),
	tags: many(mealTag),
}));

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

export const mealIngredientRelations = relations(mealIngredient, ({ one }) => ({
	meal: one(meal, {
		fields: [mealIngredient.mealId],
		references: [meal.id],
	}),
	inventory: one(inventory, {
		fields: [mealIngredient.inventoryId],
		references: [inventory.id],
	}),
}));

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

export const mealTagRelations = relations(mealTag, ({ one }) => ({
	meal: one(meal, {
		fields: [mealTag.mealId],
		references: [meal.id],
	}),
}));

export const groceryList = sqliteTable(
	"grocery_list",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull().default("Shopping List"),
		shareToken: text("share_token").unique(),
		shareExpiresAt: integer("share_expires_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("grocery_list_org_idx").on(table.organizationId),
		index("grocery_list_share_idx").on(table.shareToken),
	],
);

export const groceryListRelations = relations(groceryList, ({ one, many }) => ({
	organization: one(organization, {
		fields: [groceryList.organizationId],
		references: [organization.id],
	}),
	items: many(groceryItem),
}));

export const groceryItem = sqliteTable(
	"grocery_item",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		listId: text("list_id")
			.notNull()
			.references(() => groceryList.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		quantity: integer("quantity").notNull().default(1),
		unit: text("unit").notNull().default("unit"),
		category: text("category").notNull().default("other"),
		isPurchased: integer("is_purchased", { mode: "boolean" })
			.notNull()
			.default(false),
		sourceMealId: text("source_meal_id").references(() => meal.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [index("grocery_item_list_idx").on(table.listId)],
);

export const groceryItemRelations = relations(groceryItem, ({ one }) => ({
	list: one(groceryList, {
		fields: [groceryItem.listId],
		references: [groceryList.id],
	}),
}));
