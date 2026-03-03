CREATE TABLE `queue_job` (
	`request_id` text PRIMARY KEY NOT NULL,
	`job_type` text NOT NULL,
	`organization_id` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `queue_job_expires_idx` ON `queue_job` (`expires_at`);--> statement-breakpoint
CREATE INDEX `queue_job_org_status_idx` ON `queue_job` (`organization_id`,`status`);