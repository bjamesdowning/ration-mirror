CREATE TABLE `supply_snooze` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`snoozed_until` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_snooze_org_idx` ON `supply_snooze` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_snooze_key` ON `supply_snooze` (`organization_id`,`normalized_name`,`domain`);