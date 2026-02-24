import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";
import type {
	MealCustomFields,
	OrganizationMetadata,
	UserSettings,
} from "../lib/types";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
	tier: text("tier").notNull().default("free"), // 'free' | 'crew_member'
	tierExpiresAt: integer("tier_expires_at", { mode: "timestamp" }),
	welcomeVoucherRedeemed: integer("welcome_voucher_redeemed", {
		mode: "boolean",
	})
		.notNull()
		.default(false),
	stripeCustomerId: text("stripe_customer_id"),
	// Extended fields
	settings: text("settings", { mode: "json" })
		.$type<UserSettings>()
		.default(sql`'{}'`), // Allergens, units, etc.
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
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
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

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }),
		updatedAt: integer("updated_at", { mode: "timestamp" }),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Better Auth Organization Plugin Tables

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	logo: text("logo"),
	metadata: text("metadata", { mode: "json" }).$type<OrganizationMetadata>(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	// Extended field for credit pooling
	credits: integer("credits").default(0).notNull(),
});

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	cargo: many(cargo),
	meals: many(meal),
	activeMealSelections: many(activeMealSelection),
	supplyLists: many(supplyList),
	mealPlans: many(mealPlan),
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

export const cargo = sqliteTable(
	"cargo",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		quantity: real("quantity").notNull(),
		unit: text("unit").notNull(), // See app/lib/units.ts for supported units
		tags: text("tags", { mode: "json" }).notNull().default("[]"), // Array of strings
		domain: text("domain").notNull().default("food"),
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
		index("cargo_org_idx").on(table.organizationId),
		index("cargo_domain_idx").on(table.organizationId, table.domain),
	],
);

export const cargoRelations = relations(cargo, ({ one }) => ({
	organization: one(organization, {
		fields: [cargo.organizationId],
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
		domain: text("domain").notNull().default("food"),
		description: text("description"),
		directions: text("directions"),
		equipment: text("equipment", { mode: "json" })
			.$type<string[]>()
			.default([]),
		servings: integer("servings").default(1),
		prepTime: integer("prep_time"),
		cookTime: integer("cook_time"),
		customFields: text("custom_fields", { mode: "json" })
			.$type<MealCustomFields>()
			.default({}),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		// Compound index covers both single-column and multi-column queries
		index("meal_org_id_idx").on(table.organizationId, table.id),
		index("meal_domain_idx").on(table.organizationId, table.domain),
	],
);

export const mealRelations = relations(meal, ({ one, many }) => ({
	organization: one(organization, {
		fields: [meal.organizationId],
		references: [organization.id],
	}),
	ingredients: many(mealIngredient),
	tags: many(mealTag),
	activeSelection: one(activeMealSelection, {
		fields: [meal.id],
		references: [activeMealSelection.mealId],
	}),
	planEntries: many(mealPlanEntry),
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
		cargoId: text("cargo_id").references(() => cargo.id, {
			onDelete: "set null",
		}),
		ingredientName: text("ingredient_name").notNull(),
		quantity: real("quantity").notNull(),
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
	cargo: one(cargo, {
		fields: [mealIngredient.cargoId],
		references: [cargo.id],
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

export const activeMealSelection = sqliteTable(
	"active_meal_selection",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		mealId: text("meal_id")
			.notNull()
			.references(() => meal.id, { onDelete: "cascade" }),
		servingsOverride: integer("servings_override"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("ams_org_idx").on(table.organizationId),
		index("ams_meal_idx").on(table.mealId),
		unique("ams_org_meal_unique").on(table.organizationId, table.mealId),
	],
);

export const activeMealSelectionRelations = relations(
	activeMealSelection,
	({ one }) => ({
		organization: one(organization, {
			fields: [activeMealSelection.organizationId],
			references: [organization.id],
		}),
		meal: one(meal, {
			fields: [activeMealSelection.mealId],
			references: [meal.id],
		}),
	}),
);

export const supplyList = sqliteTable(
	"supply_list",
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
		index("supply_list_org_idx").on(table.organizationId),
		index("supply_list_share_idx").on(table.shareToken),
	],
);

export const supplyListRelations = relations(supplyList, ({ one, many }) => ({
	organization: one(organization, {
		fields: [supplyList.organizationId],
		references: [organization.id],
	}),
	items: many(supplyItem),
}));

export const supplyItem = sqliteTable(
	"supply_item",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		listId: text("list_id")
			.notNull()
			.references(() => supplyList.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		quantity: real("quantity").notNull().default(1),
		unit: text("unit").notNull().default("unit"),
		domain: text("domain").notNull().default("food"),
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
	(table) => [
		index("supply_item_list_idx").on(table.listId),
		index("supply_item_domain_idx").on(table.listId, table.domain),
	],
);

export const supplyItemRelations = relations(supplyItem, ({ one }) => ({
	list: one(supplyList, {
		fields: [supplyItem.listId],
		references: [supplyList.id],
	}),
}));

export const mealPlan = sqliteTable(
	"meal_plan",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull().default("Meal Plan"),
		shareToken: text("share_token").unique(),
		shareExpiresAt: integer("share_expires_at", { mode: "timestamp" }),
		isArchived: integer("is_archived", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("meal_plan_org_idx").on(table.organizationId),
		index("meal_plan_share_idx").on(table.shareToken),
	],
);

export const mealPlanRelations = relations(mealPlan, ({ one, many }) => ({
	organization: one(organization, {
		fields: [mealPlan.organizationId],
		references: [organization.id],
	}),
	entries: many(mealPlanEntry),
}));

export const mealPlanEntry = sqliteTable(
	"meal_plan_entry",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		planId: text("plan_id")
			.notNull()
			.references(() => mealPlan.id, { onDelete: "cascade" }),
		mealId: text("meal_id")
			.notNull()
			.references(() => meal.id, { onDelete: "cascade" }),
		date: text("date").notNull(), // ISO date: YYYY-MM-DD
		slotType: text("slot_type").notNull().default("dinner"), // breakfast|lunch|dinner|snack
		orderIndex: integer("order_index").notNull().default(0),
		servingsOverride: integer("servings_override"),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("mpe_plan_date_idx").on(table.planId, table.date),
		index("mpe_plan_date_slot_idx").on(
			table.planId,
			table.date,
			table.slotType,
		),
		index("mpe_meal_idx").on(table.mealId),
	],
);

export const mealPlanEntryRelations = relations(mealPlanEntry, ({ one }) => ({
	plan: one(mealPlan, {
		fields: [mealPlanEntry.planId],
		references: [mealPlan.id],
	}),
	meal: one(meal, {
		fields: [mealPlanEntry.mealId],
		references: [meal.id],
	}),
}));

// API keys for programmatic access (inventory export/import)
export const apiKey = sqliteTable(
	"api_key",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		keyHash: text("key_hash").notNull(),
		keyPrefix: text("key_prefix").notNull(),
		name: text("name").notNull(),
		scopes: text("scopes").notNull(), // JSON array e.g. ["inventory"]
		lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("api_key_prefix_idx").on(table.keyPrefix),
		index("api_key_org_idx").on(table.organizationId),
	],
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
	organization: one(organization, {
		fields: [apiKey.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [apiKey.userId],
		references: [user.id],
	}),
}));
