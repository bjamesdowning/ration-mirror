CREATE TABLE `nutrition_fuel_day` (
	`user_id` text NOT NULL,
	`fuel_date` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `fuel_date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nutrition_fuel_day_used_nonnegative" CHECK("nutrition_fuel_day"."used" >= 0)
);
--> statement-breakpoint
ALTER TABLE `nutrition_intake` ADD `fuel_date` text;--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_fuel_date_idx` ON `nutrition_intake` (`user_id`,`fuel_date`,`occurred_at`,`id`) WHERE "nutrition_intake"."voided_at" IS NULL;--> statement-breakpoint
ALTER TABLE `queue_job` ADD `user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `queue_job_user_status_expires_idx` ON `queue_job` (`user_id`,`status`,`expires_at`);