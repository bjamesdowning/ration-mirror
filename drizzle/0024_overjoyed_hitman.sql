CREATE INDEX `cargo_org_expires_idx` ON `cargo` (`organization_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);