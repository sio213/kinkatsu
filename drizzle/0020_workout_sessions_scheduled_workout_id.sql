ALTER TABLE `workout_sessions` ADD `scheduled_workout_id` integer REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE set null;
