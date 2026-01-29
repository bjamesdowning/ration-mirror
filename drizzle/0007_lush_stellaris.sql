PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_grocery_list` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text DEFAULT 'Shopping List' NOT NULL,
	`share_token` text,
	`share_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_grocery_list`("id", "organization_id", "name", "share_token", "share_expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "name", "share_token", "share_expires_at", "created_at", "updated_at" FROM `grocery_list`;--> statement-breakpoint
DROP TABLE `grocery_list`;--> statement-breakpoint
ALTER TABLE `__new_grocery_list` RENAME TO `grocery_list`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `grocery_list_share_token_unique` ON `grocery_list` (`share_token`);--> statement-breakpoint
CREATE INDEX `grocery_list_org_idx` ON `grocery_list` (`organization_id`);--> statement-breakpoint
CREATE INDEX `grocery_list_share_idx` ON `grocery_list` (`share_token`);--> statement-breakpoint
CREATE TABLE `__new_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'stable' NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_inventory`("id", "organization_id", "name", "quantity", "unit", "tags", "category", "status", "expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "name", "quantity", "unit", "tags", "category", "status", "expires_at", "created_at", "updated_at" FROM `inventory`;--> statement-breakpoint
DROP TABLE `inventory`;--> statement-breakpoint
ALTER TABLE `__new_inventory` RENAME TO `inventory`;--> statement-breakpoint
CREATE INDEX `inventory_org_idx` ON `inventory` (`organization_id`);--> statement-breakpoint
CREATE INDEX `inventory_category_idx` ON `inventory` (`organization_id`,`category`);--> statement-breakpoint
CREATE TABLE `__new_meal` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`directions` text,
	`equipment` text DEFAULT '[]',
	`servings` integer DEFAULT 1,
	`prep_time` integer,
	`cook_time` integer,
	`custom_fields` text DEFAULT '{}',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_meal`("id", "organization_id", "name", "description", "directions", "equipment", "servings", "prep_time", "cook_time", "custom_fields", "created_at", "updated_at") SELECT "id", "organization_id", "name", "description", "directions", "equipment", "servings", "prep_time", "cook_time", "custom_fields", "created_at", "updated_at" FROM `meal`;--> statement-breakpoint
DROP TABLE `meal`;--> statement-breakpoint
ALTER TABLE `__new_meal` RENAME TO `meal`;--> statement-breakpoint
CREATE INDEX `meal_org_idx` ON `meal` (`organization_id`);--> statement-breakpoint
CREATE INDEX `meal_org_id_idx` ON `meal` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ledger`("id", "organization_id", "user_id", "amount", "reason", "created_at") SELECT "id", "organization_id", "user_id", "amount", "reason", "created_at" FROM `ledger`;--> statement-breakpoint
DROP TABLE `ledger`;--> statement-breakpoint
ALTER TABLE `__new_ledger` RENAME TO `ledger`;--> statement-breakpoint
CREATE INDEX `ledger_org_idx` ON `ledger` (`organization_id`);--> statement-breakpoint
CREATE INDEX `ledger_user_idx` ON `ledger` (`user_id`);--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `credits`;