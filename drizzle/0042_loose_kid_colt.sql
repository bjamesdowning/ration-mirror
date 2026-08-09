CREATE TABLE `nutrition_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`policy_version` text NOT NULL,
	`source` text NOT NULL,
	`granted_at` integer NOT NULL,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nutrition_consent_user_purpose_idx` ON `nutrition_consent` (`user_id`,`purpose`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_consent_active_uidx` ON `nutrition_consent` (`user_id`,`purpose`) WHERE "nutrition_consent"."withdrawn_at" IS NULL;--> statement-breakpoint
ALTER TABLE `meal_plan_entry` ADD `cooked_at` integer;--> statement-breakpoint
ALTER TABLE `meal_plan_entry` ADD `cooked_by_user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `mpe_plan_cooked_at_idx` ON `meal_plan_entry` (`plan_id`,`cooked_at`);--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `schema_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `nutrients_json` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `coverage_json` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `operation_id` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `replaces_intake_id` text;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `voided_at` integer;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `voided_by_user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_history_idx` ON `nutrition_intake` (`user_id`,`organization_id`,`manifest_date`,`occurred_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_intake_user_idempotency_uidx` ON `nutrition_intake` (`user_id`,`idempotency_key`) WHERE "nutrition_intake"."idempotency_key" IS NOT NULL;