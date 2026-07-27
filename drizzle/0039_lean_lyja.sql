PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_supply_item` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'unit' NOT NULL,
	`base_quantity` real DEFAULT 1 NOT NULL,
	`base_unit` text DEFAULT 'unit' NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`is_purchased` integer DEFAULT false NOT NULL,
	`source_meal_id` text,
	`source_meal_ids` text DEFAULT '[]' NOT NULL,
	`source_origins` text DEFAULT '[]' NOT NULL,
	`source_cargo_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `supply_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_cargo_id`) REFERENCES `cargo`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_supply_item`("id", "list_id", "name", "quantity", "unit", "base_quantity", "base_unit", "domain", "is_purchased", "source_meal_id", "source_meal_ids", "source_origins", "source_cargo_id", "created_at") SELECT "id", "list_id", "name", "quantity", "unit", "base_quantity", "base_unit", "domain", "is_purchased", "source_meal_id", "source_meal_ids", "source_origins", "source_cargo_id", "created_at" FROM `supply_item`;--> statement-breakpoint
DROP TABLE `supply_item`;--> statement-breakpoint
ALTER TABLE `__new_supply_item` RENAME TO `supply_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `supply_item_list_idx` ON `supply_item` (`list_id`);--> statement-breakpoint
CREATE INDEX `supply_item_domain_idx` ON `supply_item` (`list_id`,`domain`);