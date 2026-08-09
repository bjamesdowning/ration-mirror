CREATE TABLE `ingredient_nutrition_match` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`fdc_id` integer,
	`description` text,
	`source` text NOT NULL,
	`confidence` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingredient_nutrition_match_org_idx` ON `ingredient_nutrition_match` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_nutrition_match_org_name_unique` ON `ingredient_nutrition_match` (`organization_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `nutrition_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`daily_energy_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fiber_g` real,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`consent_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nutrition_goal_user_idx` ON `nutrition_goal` (`user_id`);--> statement-breakpoint
CREATE TABLE `nutrition_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`entry_id` text,
	`meal_id` text,
	`manifest_date` text NOT NULL,
	`slot_type` text,
	`servings` real NOT NULL,
	`energy_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`coverage` real NOT NULL,
	`source` text NOT NULL,
	`confidence` real NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`occurred_at` integer NOT NULL,
	`kitchen_event_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kitchen_event_id`) REFERENCES `kitchen_event`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_date_idx` ON `nutrition_intake` (`user_id`,`manifest_date`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_org_date_idx` ON `nutrition_intake` (`organization_id`,`manifest_date`);--> statement-breakpoint
ALTER TABLE `cargo` ADD `nutrition` text;--> statement-breakpoint
ALTER TABLE `meal` ADD `nutrition` text;