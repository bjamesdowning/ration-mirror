DROP INDEX `inventory_category_idx`;--> statement-breakpoint
ALTER TABLE `inventory` DROP COLUMN `category`;--> statement-breakpoint
ALTER TABLE `grocery_item` DROP COLUMN `category`;
