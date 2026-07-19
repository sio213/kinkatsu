CREATE TABLE `scheduled_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_id` integer NOT NULL,
	`scheduled_date` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sw_date` ON `scheduled_workouts` (`scheduled_date`);
--> statement-breakpoint
CREATE INDEX `idx_sw_routine` ON `scheduled_workouts` (`routine_id`);
