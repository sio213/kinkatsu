CREATE TABLE `scheduled_workout_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheduled_workout_exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`duration_seconds` integer,
	`distance_meters` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scheduled_workout_exercise_id`) REFERENCES `scheduled_workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sws_exercise` ON `scheduled_workout_sets` (`scheduled_workout_exercise_id`);
