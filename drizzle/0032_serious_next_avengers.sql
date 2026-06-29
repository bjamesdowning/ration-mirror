CREATE TABLE `mobile_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_refresh_token_token_hash_unique` ON `mobile_refresh_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mobile_refresh_token_user_id_idx` ON `mobile_refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `mobile_refresh_token_family_id_idx` ON `mobile_refresh_token` (`family_id`);