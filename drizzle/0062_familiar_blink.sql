CREATE TABLE `nutrition_food_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`organization_name_snapshot` text,
	`operation_id` text NOT NULL,
	`subject` text NOT NULL,
	`lines_json` text,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nutrition_food_draft_user_idx` ON `nutrition_food_draft` (`user_id`,`created_at`);