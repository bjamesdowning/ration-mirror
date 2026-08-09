PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_nutrition_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`daily_energy_kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`fiber_g` real,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`consent_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_goal`("id", "user_id", "daily_energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "effective_from", "effective_to", "consent_at", "created_at") SELECT "id", "user_id", "daily_energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "effective_from", "effective_to", "consent_at", "created_at" FROM `nutrition_goal`;--> statement-breakpoint
DROP TABLE `nutrition_goal`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_goal` RENAME TO `nutrition_goal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `nutrition_goal_user_idx` ON `nutrition_goal` (`user_id`);