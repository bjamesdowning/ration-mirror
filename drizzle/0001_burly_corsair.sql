CREATE TABLE `meal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`directions` text,
	`equipment` text DEFAULT '[]',
	`servings` integer DEFAULT 1,
	`prep_time` integer,
	`cook_time` integer,
	`custom_fields` text DEFAULT '{}',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_user_idx` ON `meal` (`user_id`);--> statement-breakpoint
CREATE TABLE `meal_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`inventory_id` text,
	`ingredient_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`is_optional` integer DEFAULT false,
	`order_index` integer DEFAULT 0,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meal_ingredient_meal_idx` ON `meal_ingredient` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_ingredient_name_idx` ON `meal_ingredient` (`ingredient_name`);--> statement-breakpoint
CREATE TABLE `meal_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_tag_meal_idx` ON `meal_tag` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_tag_tag_idx` ON `meal_tag` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `meal_tag_unique` ON `meal_tag` (`meal_id`,`tag`);