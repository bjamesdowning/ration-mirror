ALTER TABLE `inventory` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `status` text DEFAULT 'stable' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_category_idx` ON `inventory` (`user_id`,`category`);--> statement-breakpoint

UPDATE inventory
SET category = CASE
  WHEN tags LIKE '%Dry%' THEN 'dry_goods'
  WHEN tags LIKE '%Frozen%' THEN 'cryo_frozen'
  WHEN tags LIKE '%Fridge%' THEN 'perishable'
  ELSE 'other'
END
WHERE category IS NULL OR category = 'uncategorized' OR category = 'other';--> statement-breakpoint

UPDATE inventory
SET status = CASE
  WHEN expires_at IS NULL THEN 'stable'
  WHEN (expires_at - unixepoch()) / 86400 < 0 THEN 'biohazard'
  WHEN (expires_at - unixepoch()) / 86400 < 3 THEN 'decay_imminent'
  ELSE 'stable'
END;--> statement-breakpoint

UPDATE inventory
SET updated_at = unixepoch()
WHERE updated_at = 0; 
