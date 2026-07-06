CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`category` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_org_slug_unique` ON `tag` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `tag_org_idx` ON `tag` (`organization_id`);--> statement-breakpoint
CREATE TABLE `cargo_tag` (
	`cargo_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`cargo_id`, `tag_id`),
	FOREIGN KEY (`cargo_id`) REFERENCES `cargo`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cargo_tag_tag_idx` ON `cargo_tag` (`tag_id`);--> statement-breakpoint
DROP TABLE `meal_tag`;--> statement-breakpoint
CREATE TABLE `meal_tag` (
	`meal_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`meal_id`, `tag_id`),
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_tag_tag_idx` ON `meal_tag` (`tag_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cargo` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`base_quantity` real DEFAULT 1 NOT NULL,
	`base_unit` text DEFAULT 'unit' NOT NULL,
	`domain` text DEFAULT 'food' NOT NULL,
	`status` text DEFAULT 'stable' NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_cargo`("id", "organization_id", "name", "quantity", "unit", "base_quantity", "base_unit", "domain", "status", "expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "name", "quantity", "unit", "base_quantity", "base_unit", "domain", "status", "expires_at", "created_at", "updated_at" FROM `cargo`;--> statement-breakpoint
DROP TABLE `cargo`;--> statement-breakpoint
ALTER TABLE `__new_cargo` RENAME TO `cargo`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cargo_org_idx` ON `cargo` (`organization_id`);--> statement-breakpoint
CREATE INDEX `cargo_domain_idx` ON `cargo` (`organization_id`,`domain`);--> statement-breakpoint
CREATE INDEX `cargo_org_expires_idx` ON `cargo` (`organization_id`,`expires_at`);
