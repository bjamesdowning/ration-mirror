-- Terminology standardization: inventory->cargo, grocery_list->supply_list, grocery_item->supply_item
-- No production data; safe to use RENAME

PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE "inventory" RENAME TO "cargo";--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_domain_idx";--> statement-breakpoint
CREATE INDEX "cargo_org_idx" ON "cargo" ("organization_id");--> statement-breakpoint
CREATE INDEX "cargo_domain_idx" ON "cargo" ("organization_id","domain");--> statement-breakpoint
ALTER TABLE "grocery_list" RENAME TO "supply_list";--> statement-breakpoint
DROP INDEX IF EXISTS "grocery_list_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "grocery_list_share_idx";--> statement-breakpoint
CREATE INDEX "supply_list_org_idx" ON "supply_list" ("organization_id");--> statement-breakpoint
CREATE INDEX "supply_list_share_idx" ON "supply_list" ("share_token");--> statement-breakpoint
CREATE TABLE "supply_item_new" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"domain" text DEFAULT 'food' NOT NULL,
	"is_purchased" integer DEFAULT false NOT NULL,
	"source_meal_id" text,
	"created_at" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("list_id") REFERENCES "supply_list"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("source_meal_id") REFERENCES "meal"("id") ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO "supply_item_new" SELECT * FROM "grocery_item";--> statement-breakpoint
DROP TABLE "grocery_item";--> statement-breakpoint
ALTER TABLE "supply_item_new" RENAME TO "supply_item";--> statement-breakpoint
CREATE INDEX "supply_item_list_idx" ON "supply_item" ("list_id");--> statement-breakpoint
CREATE INDEX "supply_item_domain_idx" ON "supply_item" ("list_id","domain");--> statement-breakpoint
CREATE TABLE "meal_ingredient_new" (
	"id" text PRIMARY KEY NOT NULL,
	"meal_id" text NOT NULL,
	"cargo_id" text,
	"ingredient_name" text NOT NULL,
	"quantity" real NOT NULL,
	"unit" text NOT NULL,
	"is_optional" integer DEFAULT false,
	"order_index" integer DEFAULT 0,
	FOREIGN KEY ("meal_id") REFERENCES "meal"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO "meal_ingredient_new"("id", "meal_id", "cargo_id", "ingredient_name", "quantity", "unit", "is_optional", "order_index") SELECT "id", "meal_id", "inventory_id", "ingredient_name", "quantity", "unit", "is_optional", "order_index" FROM "meal_ingredient";--> statement-breakpoint
DROP TABLE "meal_ingredient";--> statement-breakpoint
ALTER TABLE "meal_ingredient_new" RENAME TO "meal_ingredient";--> statement-breakpoint
CREATE INDEX "meal_ingredient_meal_idx" ON "meal_ingredient" ("meal_id");--> statement-breakpoint
CREATE INDEX "meal_ingredient_name_idx" ON "meal_ingredient" ("ingredient_name");--> statement-breakpoint
PRAGMA foreign_keys=ON;
