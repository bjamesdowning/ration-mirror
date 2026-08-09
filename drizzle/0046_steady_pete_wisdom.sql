PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_nutrition_recompute_job` (
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`originating_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_recompute_job`("job_key", "organization_id", "subject_type", "subject_id", "trigger", "requested_revision", "processing_revision", "completed_revision", "status", "attempt_count", "dispatch_after", "last_dispatched_at", "lease_token", "lease_expires_at", "last_error_code", "sweep_cursor", "originating_surface", "originating_user_id", "originating_client_version", "originating_country", "originating_environment", "originating_plan", "created_at", "updated_at", "completed_at", "expires_at") SELECT "job_key", "organization_id", "subject_type", "subject_id", "trigger", "requested_revision", "processing_revision", "completed_revision", "status", "attempt_count", "dispatch_after", "last_dispatched_at", "lease_token", "lease_expires_at", "last_error_code", "sweep_cursor", "originating_surface", "originating_user_id", "originating_client_version", "originating_country", "originating_environment", "originating_plan", "created_at", "updated_at", "completed_at", "expires_at" FROM `nutrition_recompute_job`;--> statement-breakpoint
DROP TABLE `nutrition_recompute_job`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_recompute_job` RENAME TO `nutrition_recompute_job`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `nutrition_recompute_due_idx` ON `nutrition_recompute_job` (`status`,`dispatch_after`,`job_key`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_lease_idx` ON `nutrition_recompute_job` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_expiry_idx` ON `nutrition_recompute_job` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `nutrition_recompute_org_subject_idx` ON `nutrition_recompute_job` (`organization_id`,`subject_type`,`subject_id`);