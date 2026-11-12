CREATE TABLE `manifest_cargo_line` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`cargo_id` text NOT NULL,
	`date` text NOT NULL,
	`slot_type` text DEFAULT 'dinner' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`notes` text,
	`cooked_at` integer,
	`cooked_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cargo_id`) REFERENCES `cargo`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cooked_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mcl_plan_date_idx` ON `manifest_cargo_line` (`plan_id`,`date`);--> statement-breakpoint
CREATE INDEX `mcl_plan_date_slot_idx` ON `manifest_cargo_line` (`plan_id`,`date`,`slot_type`);