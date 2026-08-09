DROP INDEX `nutrition_operation_user_org_key_unique`;--> statement-breakpoint
CREATE INDEX `nutrition_operation_user_org_idx` ON `nutrition_operation` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_operation_user_key_unique` ON `nutrition_operation` (`user_id`,`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_goal_user_open_uidx` ON `nutrition_goal` (`user_id`) WHERE "nutrition_goal"."effective_to" IS NULL;