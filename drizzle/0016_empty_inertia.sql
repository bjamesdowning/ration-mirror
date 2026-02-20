PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_grocery_item` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'unit' NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`is_purchased` integer DEFAULT false NOT NULL,
	`source_meal_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `grocery_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_grocery_item`("id", "list_id", "name", "quantity", "unit", "domain", "is_purchased", "source_meal_id", "created_at") SELECT "id", "list_id", "name", "quantity", "unit", "domain", "is_purchased", "source_meal_id", "created_at" FROM `grocery_item`;--> statement-breakpoint
DROP TABLE `grocery_item`;--> statement-breakpoint
ALTER TABLE `__new_grocery_item` RENAME TO `grocery_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `grocery_item_list_idx` ON `grocery_item` (`list_id`);--> statement-breakpoint
CREATE INDEX `grocery_item_domain_idx` ON `grocery_item` (`list_id`,`domain`);--> statement-breakpoint
CREATE TABLE `__new_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`status` text DEFAULT 'stable' NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_inventory`("id", "organization_id", "name", "quantity", "unit", "tags", "domain", "status", "expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "name", "quantity", "unit", "tags", "domain", "status", "expires_at", "created_at", "updated_at" FROM `inventory`;--> statement-breakpoint
DROP TABLE `inventory`;--> statement-breakpoint
ALTER TABLE `__new_inventory` RENAME TO `inventory`;--> statement-breakpoint
CREATE INDEX `inventory_org_idx` ON `inventory` (`organization_id`);--> statement-breakpoint
CREATE INDEX `inventory_domain_idx` ON `inventory` (`organization_id`,`domain`);--> statement-breakpoint
CREATE TABLE `__new_meal_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`inventory_id` text,
	`ingredient_name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`is_optional` integer DEFAULT false,
	`order_index` integer DEFAULT 0,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_meal_ingredient`("id", "meal_id", "inventory_id", "ingredient_name", "quantity", "unit", "is_optional", "order_index") SELECT "id", "meal_id", "inventory_id", "ingredient_name", "quantity", "unit", "is_optional", "order_index" FROM `meal_ingredient`;--> statement-breakpoint
DROP TABLE `meal_ingredient`;--> statement-breakpoint
ALTER TABLE `__new_meal_ingredient` RENAME TO `meal_ingredient`;--> statement-breakpoint
CREATE INDEX `meal_ingredient_meal_idx` ON `meal_ingredient` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_ingredient_name_idx` ON `meal_ingredient` (`ingredient_name`);