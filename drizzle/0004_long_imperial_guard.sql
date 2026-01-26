CREATE TABLE `grocery_item` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'unit' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`is_purchased` integer DEFAULT false NOT NULL,
	`source_meal_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `grocery_list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `grocery_item_list_idx` ON `grocery_item` (`list_id`);--> statement-breakpoint
CREATE TABLE `grocery_list` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'Shopping List' NOT NULL,
	`share_token` text,
	`share_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grocery_list_share_token_unique` ON `grocery_list` (`share_token`);--> statement-breakpoint
CREATE INDEX `grocery_list_user_idx` ON `grocery_list` (`user_id`);--> statement-breakpoint
CREATE INDEX `grocery_list_share_idx` ON `grocery_list` (`share_token`);