CREATE TABLE `reminder_schedule_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reminder_id` integer NOT NULL,
	`skipped_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rss_unique` ON `reminder_schedule_skips` (`reminder_id`,`skipped_date`);
