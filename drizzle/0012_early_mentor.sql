ALTER TABLE `grocery_item` ADD `domain` text DEFAULT 'food' NOT NULL;--> statement-breakpoint
CREATE INDEX `grocery_item_domain_idx` ON `grocery_item` (`list_id`,`domain`);--> statement-breakpoint
ALTER TABLE `inventory` ADD `domain` text DEFAULT 'food' NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_domain_idx` ON `inventory` (`organization_id`,`domain`);--> statement-breakpoint
ALTER TABLE `meal` ADD `domain` text DEFAULT 'food' NOT NULL;--> statement-breakpoint
CREATE INDEX `meal_domain_idx` ON `meal` (`organization_id`,`domain`);