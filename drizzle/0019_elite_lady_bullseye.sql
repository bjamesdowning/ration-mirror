CREATE TABLE `meal_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text DEFAULT 'Meal Plan' NOT NULL,
	`share_token` text,
	`share_expires_at` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_share_token_unique` ON `meal_plan` (`share_token`);--> statement-breakpoint
CREATE INDEX `meal_plan_org_idx` ON `meal_plan` (`organization_id`);--> statement-breakpoint
CREATE INDEX `meal_plan_share_idx` ON `meal_plan` (`share_token`);--> statement-breakpoint
CREATE TABLE `meal_plan_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`meal_id` text NOT NULL,
	`date` text NOT NULL,
	`slot_type` text DEFAULT 'dinner' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`servings_override` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mpe_plan_date_idx` ON `meal_plan_entry` (`plan_id`,`date`);--> statement-breakpoint
CREATE INDEX `mpe_plan_date_slot_idx` ON `meal_plan_entry` (`plan_id`,`date`,`slot_type`);--> statement-breakpoint
CREATE INDEX `mpe_meal_idx` ON `meal_plan_entry` (`meal_id`);