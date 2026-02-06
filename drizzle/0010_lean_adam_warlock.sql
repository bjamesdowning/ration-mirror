CREATE TABLE `active_meal_selection` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`meal_id` text NOT NULL,
	`servings_override` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ams_org_idx` ON `active_meal_selection` (`organization_id`);--> statement-breakpoint
CREATE INDEX `ams_meal_idx` ON `active_meal_selection` (`meal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ams_org_meal_unique` ON `active_meal_selection` (`organization_id`,`meal_id`);