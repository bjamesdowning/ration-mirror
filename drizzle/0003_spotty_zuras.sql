ALTER TABLE `inventory` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `status` text DEFAULT 'stable' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `updated_at` integer DEFAULT (unixepoch()) NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_category_idx` ON `inventory` (`user_id`,`category`);