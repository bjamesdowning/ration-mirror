ALTER TABLE `user` ADD `is_admin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `user` SET `is_admin` = 1 WHERE `email` = 'bjamesdowning@gmail.com';
