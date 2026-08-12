PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_nutrition_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`user_id` text NOT NULL,
	`plan_id` text,
	`entry_id` text,
	`meal_id` text,
	`organization_name_snapshot` text,
	`meal_name_snapshot` text,
	`manifest_date` text NOT NULL,
	`slot_type` text,
	`servings` real NOT NULL,
	`energy_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`coverage` real NOT NULL,
	`source` text NOT NULL,
	`confidence` real NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`occurred_at` integer NOT NULL,
	`kitchen_event_id` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`nutrients_json` text,
	`coverage_json` text,
	`fiber_g` real,
	`consent_id` text,
	`idempotency_key` text,
	`operation_id` text,
	`replaces_intake_id` text,
	`void_operation_id` text,
	`voided_at` integer,
	`voided_by_user_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kitchen_event_id`) REFERENCES `kitchen_event`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`consent_id`) REFERENCES `nutrition_consent`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`voided_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_intake`(
	"id", "organization_id", "user_id", "plan_id", "entry_id", "meal_id",
	"organization_name_snapshot", "meal_name_snapshot",
	"manifest_date", "slot_type", "servings", "energy_kcal", "protein_g", "carbs_g", "fat_g",
	"coverage", "source", "confidence", "verified", "occurred_at", "kitchen_event_id",
	"schema_version", "nutrients_json", "coverage_json", "fiber_g", "consent_id",
	"idempotency_key", "operation_id", "replaces_intake_id", "void_operation_id",
	"voided_at", "voided_by_user_id", "notes", "created_at"
)
SELECT
	ni."id", ni."organization_id", ni."user_id", ni."plan_id", ni."entry_id", ni."meal_id",
	(SELECT o."name" FROM "organization" o WHERE o."id" = ni."organization_id"),
	(SELECT m."name" FROM "meal" m WHERE m."id" = ni."meal_id"),
	ni."manifest_date", ni."slot_type", ni."servings", ni."energy_kcal", ni."protein_g", ni."carbs_g", ni."fat_g",
	ni."coverage", ni."source", ni."confidence", ni."verified", ni."occurred_at", ni."kitchen_event_id",
	ni."schema_version", ni."nutrients_json", ni."coverage_json", ni."fiber_g", ni."consent_id",
	ni."idempotency_key", ni."operation_id", ni."replaces_intake_id", ni."void_operation_id",
	ni."voided_at", ni."voided_by_user_id", ni."notes", ni."created_at"
FROM `nutrition_intake` ni;--> statement-breakpoint
DROP TABLE `nutrition_intake`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_intake` RENAME TO `nutrition_intake`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_date_idx` ON `nutrition_intake` (`user_id`,`manifest_date`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_org_date_idx` ON `nutrition_intake` (`organization_id`,`manifest_date`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_history_idx` ON `nutrition_intake` (`user_id`,`organization_id`,`manifest_date`,`occurred_at`,`id`) WHERE "nutrition_intake"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX `nutrition_intake_user_diary_history_idx` ON `nutrition_intake` (`user_id`,`manifest_date`,`occurred_at`,`id`) WHERE "nutrition_intake"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX `nutrition_intake_retention_idx` ON `nutrition_intake` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `nutrition_intake_operation_idx` ON `nutrition_intake` (`user_id`,`organization_id`,`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_intake_user_idempotency_uidx` ON `nutrition_intake` (`user_id`,`idempotency_key`) WHERE "nutrition_intake"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_intake_user_org_entry_active_uidx` ON `nutrition_intake` (`user_id`,`organization_id`,`entry_id`) WHERE "nutrition_intake"."entry_id" IS NOT NULL AND "nutrition_intake"."organization_id" IS NOT NULL AND "nutrition_intake"."voided_at" IS NULL;
