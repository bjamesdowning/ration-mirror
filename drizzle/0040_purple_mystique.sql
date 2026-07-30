CREATE TABLE `kitchen_event` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL,
	`meal_id` text,
	`cargo_id` text,
	`subject_name` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cargo_id`) REFERENCES `cargo`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `kitchen_event_org_occurred_idx` ON `kitchen_event` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `kitchen_event_org_type_occurred_idx` ON `kitchen_event` (`organization_id`,`event_type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `kitchen_event_cargo_type_idx` ON `kitchen_event` (`cargo_id`,`event_type`);