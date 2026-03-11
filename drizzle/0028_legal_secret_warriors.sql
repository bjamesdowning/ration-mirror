ALTER TABLE `user` ADD `tos_accepted_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `tos_version` text DEFAULT '2026-03-11' NOT NULL;