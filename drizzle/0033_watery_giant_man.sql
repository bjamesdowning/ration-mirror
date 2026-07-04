CREATE TABLE `manifest_supply_day` (
	`organization_id` text NOT NULL,
	`date` text NOT NULL,
	`excluded` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `manifest_supply_day_org_idx` ON `manifest_supply_day` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `manifest_supply_day_org_date` ON `manifest_supply_day` (`organization_id`,`date`);