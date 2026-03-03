CREATE TABLE `interest_signup` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`source` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interest_signup_email_idx` ON `interest_signup` (`email`);--> statement-breakpoint
CREATE INDEX `interest_signup_created_idx` ON `interest_signup` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `interest_signup_email_unique` ON `interest_signup` (`email`);