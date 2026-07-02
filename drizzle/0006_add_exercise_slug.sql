ALTER TABLE `exercises` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exercises_slug` ON `exercises` (`slug`);