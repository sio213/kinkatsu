ALTER TABLE `workout_sessions` ADD `routine_id` integer REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `idx_ws_routine` ON `workout_sessions` (`routine_id`);
