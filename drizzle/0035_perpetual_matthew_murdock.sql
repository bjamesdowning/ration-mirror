ALTER TABLE `cargo` ADD `base_quantity` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cargo` ADD `base_unit` text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_ingredient` ADD `base_quantity` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_ingredient` ADD `base_unit` text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `base_quantity` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `base_unit` text DEFAULT 'unit' NOT NULL;