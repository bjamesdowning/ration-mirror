CREATE TABLE `import_dispatch` (
	`request_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`job_type` text DEFAULT 'import_url' NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`ledger_idempotency_key` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_dispatch_org_user_idx` ON `import_dispatch` (`organization_id`,`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `import_dispatch_state_next_idx` ON `import_dispatch` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_dispatch_ledger_key_uidx` ON `import_dispatch` (`ledger_idempotency_key`) WHERE "import_dispatch"."ledger_idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_idempotency_key_uidx` ON `ledger` (`idempotency_key`) WHERE "ledger"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `meal` ADD `import_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_import_request_uidx` ON `meal` (`import_request_id`) WHERE "meal"."import_request_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `queue_job` ADD `processing_owner` text;--> statement-breakpoint
ALTER TABLE `queue_job` ADD `processing_lease_expires_at` integer;