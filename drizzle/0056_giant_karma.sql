CREATE TABLE `supply_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`list_id` text,
	`operation_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`applied_at` integer DEFAULT (unixepoch()) NOT NULL,
	`result_json` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `supply_list`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_operation_org_idx` ON `supply_operation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `supply_operation_applied_idx` ON `supply_operation` (`applied_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_operation_org_op` ON `supply_operation` (`organization_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `supply_staple` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'unit' NOT NULL,
	`base_quantity` real DEFAULT 1 NOT NULL,
	`base_unit` text DEFAULT 'unit' NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`category` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_staple_org_idx` ON `supply_staple` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_staple_org_name_domain` ON `supply_staple` (`organization_id`,`normalized_name`,`domain`);--> statement-breakpoint
CREATE TABLE `supply_store_aisle` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `supply_store_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_store_aisle_profile_idx` ON `supply_store_aisle` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_store_aisle_profile_category` ON `supply_store_aisle` (`profile_id`,`category`);--> statement-breakpoint
CREATE TABLE `supply_store_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_store_profile_org_idx` ON `supply_store_profile` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_store_profile_org_name` ON `supply_store_profile` (`organization_id`,`normalized_name`);--> statement-breakpoint
ALTER TABLE `supply_item` ADD `note` text;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `category` text;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_item` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `kind` text DEFAULT 'saved' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `created_from` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `source_list_id` text REFERENCES supply_list(id);--> statement-breakpoint
ALTER TABLE `supply_list` ADD `source_reference` text;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `store_profile_id` text REFERENCES supply_store_profile(id);--> statement-breakpoint
ALTER TABLE `supply_list` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_list` ADD `quota_slot` integer;--> statement-breakpoint
UPDATE `supply_list`
SET `kind` = 'live'
WHERE `id` IN (
	SELECT `id` FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `organization_id`
				ORDER BY
					CASE WHEN `name` = 'Supply' THEN 0 ELSE 1 END,
					`updated_at` DESC,
					`id` ASC
			) AS `rn`
		FROM `supply_list`
	)
	WHERE `rn` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_list_one_live_per_org` ON `supply_list` (`organization_id`) WHERE "supply_list"."kind" = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX `supply_list_quota_slot_uidx` ON `supply_list` (`organization_id`,`quota_slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_list_source_ref_uidx` ON `supply_list` (`organization_id`,`created_from`,`source_reference`) WHERE "supply_list"."source_reference" IS NOT NULL;