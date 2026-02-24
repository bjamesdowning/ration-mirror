ALTER TABLE `meal` ADD `type` text DEFAULT 'recipe' NOT NULL;--> statement-breakpoint
CREATE INDEX `meal_type_idx` ON `meal` (`organization_id`,`type`);