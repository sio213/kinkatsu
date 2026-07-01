CREATE TABLE `reminder_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reminder_id` integer NOT NULL,
	`os_notification_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`fire_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rn_reminder` ON `reminder_notifications` (`reminder_id`);--> statement-breakpoint
CREATE INDEX `idx_rn_fire_at` ON `reminder_notifications` (`fire_at`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`weekdays` text,
	`monthdays` text,
	`anchor_date` integer,
	`interval_days` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
