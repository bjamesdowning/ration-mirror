PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`token` text,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_invitation`("id", "organization_id", "email", "token", "role", "status", "expires_at", "inviter_id", "created_at") SELECT "id", "organization_id", "email", "token", "role", "status", "expires_at", "inviter_id", "created_at" FROM `invitation`;--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
ALTER TABLE `__new_invitation` RENAME TO `invitation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_unique` ON `invitation` (`token`);--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_token_idx` ON `invitation` (`token`);