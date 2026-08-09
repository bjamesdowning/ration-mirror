CREATE TABLE `nutrition_access_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`event_version` integer DEFAULT 1 NOT NULL,
	`user_id` text,
	`organization_id` text,
	`surface` text NOT NULL,
	`auth_method` text NOT NULL,
	`credential_id` text,
	`client_id` text,
	`event_type` text NOT NULL,
	`required_scope` text,
	`consent_purpose` text,
	`consent_policy_version` text,
	`outcome` text NOT NULL,
	`error_code` text,
	`replayed` integer DEFAULT false NOT NULL,
	`item_count_bucket` text,
	`date_range_bucket` text,
	`request_id` text NOT NULL,
	`operation_id` text,
	`duration_bucket` text,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nutrition_access_audit_user_occurred_idx` ON `nutrition_access_audit` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `nutrition_access_audit_org_occurred_idx` ON `nutrition_access_audit` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `nutrition_access_audit_request_idx` ON `nutrition_access_audit` (`request_id`);--> statement-breakpoint
CREATE TABLE `nutrition_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`operation_type` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`item_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nutrition_operation_status_created_idx` ON `nutrition_operation` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_operation_user_org_key_unique` ON `nutrition_operation` (`user_id`,`organization_id`,`operation_key`);--> statement-breakpoint
CREATE TABLE `nutrition_recompute_job` (
	`job_key` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`trigger` text NOT NULL,
	`requested_revision` integer DEFAULT 1 NOT NULL,
	`processing_revision` integer,
	`completed_revision` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`dispatch_after` integer NOT NULL,
	`last_dispatched_at` integer,
	`lease_token` text,
	`lease_expires_at` integer,
	`last_error_code` text,
	`sweep_cursor` text,
	`originating_surface` text NOT NULL,
	`originating_user_id` text,
	`originating_client_version` text,
	`originating_country` text,
	`originating_environment` text,
	`originating_plan` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nutrition_recompute_due_idx` ON `nutrition_recompute_job` (`status`,`dispatch_after`,`job_key`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_lease_idx` ON `nutrition_recompute_job` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_expiry_idx` ON `nutrition_recompute_job` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_org_subject_idx` ON `nutrition_recompute_job` (`organization_id`,`subject_type`,`subject_id`);--> statement-breakpoint
DROP INDEX `nutrition_consent_active_uidx`;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `statement_version` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `statement_sha256` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `privacy_notice_version` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `client_surface` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `client_version` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `nutrition_consent` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_consent_user_request_uidx` ON `nutrition_consent` (`user_id`,`request_id`) WHERE "nutrition_consent"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_consent_active_uidx` ON `nutrition_consent` (`user_id`,`purpose`,`policy_version`) WHERE "nutrition_consent"."withdrawn_at" IS NULL;--> statement-breakpoint
DROP INDEX `nutrition_intake_user_history_idx`;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `fiber_g` real;--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `consent_id` text REFERENCES nutrition_consent(id);--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `void_operation_id` text;--> statement-breakpoint
CREATE INDEX `nutrition_intake_retention_idx` ON `nutrition_intake` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_operation_idx` ON `nutrition_intake` (`user_id`,`organization_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_history_idx` ON `nutrition_intake` (`user_id`,`organization_id`,`manifest_date`,`occurred_at`,`id`) WHERE "nutrition_intake"."voided_at" IS NULL;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `resolution_kind` text;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `decision_source` text;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `match_quality` text;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `match_score` real;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `score_margin` real;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `matcher_version` text;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `dataset_snapshot_id` text;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `reviewed_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `ingredient_nutrition_match` ADD `reviewed_at` integer;--> statement-breakpoint
CREATE INDEX `ingredient_nutrition_match_expiry_idx` ON `ingredient_nutrition_match` (`expires_at`);--> statement-breakpoint
ALTER TABLE `meal` ADD `nutrition_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal` ADD `nutrition_computed_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal` ADD `nutrition_status` text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal` ADD `nutrition_updated_at` integer;--> statement-breakpoint
ALTER TABLE `nutrition_goal` ADD `consent_id` text REFERENCES nutrition_consent(id);--> statement-breakpoint
CREATE INDEX `nutrition_goal_user_effective_idx` ON `nutrition_goal` (`user_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `meal_ingredient_cargo_meal_idx` ON `meal_ingredient` (`cargo_id`,`meal_id`);