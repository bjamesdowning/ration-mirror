ALTER TABLE `nutrition_intake` ADD `health_sync_id` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `health_sync_version` integer;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `composition_source` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `composition_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `fdc_id` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `barcode` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `saved_food_id` text;