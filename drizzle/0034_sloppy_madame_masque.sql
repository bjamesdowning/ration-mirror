CREATE TABLE `active_cargo_selection` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`cargo_id` text NOT NULL,
	`quantity_override` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cargo_id`) REFERENCES `cargo`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `acs_org_idx` ON `active_cargo_selection` (`organization_id`);--> statement-breakpoint
CREATE INDEX `acs_cargo_idx` ON `active_cargo_selection` (`cargo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `acs_org_cargo_unique` ON `active_cargo_selection` (`organization_id`,`cargo_id`);--> statement-breakpoint
ALTER TABLE `supply_item` ADD `source_origins` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `source_cargo_id` text REFERENCES cargo(id);