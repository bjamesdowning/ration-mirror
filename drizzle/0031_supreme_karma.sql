CREATE TABLE `agent_registration` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`status` text DEFAULT 'pending_claim' NOT NULL,
	`claim_token_hash` text NOT NULL,
	`claim_token_expires_at` integer NOT NULL,
	`claimed_by_user_id` text,
	`claimed_at` integer,
	`client_hint` text,
	`pre_claim` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_registration_user_idx` ON `agent_registration` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_registration_org_idx` ON `agent_registration` (`organization_id`);--> statement-breakpoint
CREATE INDEX `agent_registration_claim_hash_idx` ON `agent_registration` (`claim_token_hash`);