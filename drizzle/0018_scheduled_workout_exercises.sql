-- scheduled_workouts.routine_idのNOT NULL制約を外す（「直接追加」予定はルーティンを持たないため）。
-- SQLiteはNOT NULL制約の変更にテーブル再作成が必要なため、0012_silky_purple_man.sqlと同じ
-- __new_テーブルパターンで既存データを保持したまま再作成する
CREATE TABLE `__new_scheduled_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_id` integer,
	`scheduled_date` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_scheduled_workouts` (`id`, `routine_id`, `scheduled_date`, `hour`, `minute`, `created_at`, `updated_at`)
SELECT `id`, `routine_id`, `scheduled_date`, `hour`, `minute`, `created_at`, `updated_at` FROM `scheduled_workouts`;
--> statement-breakpoint
DROP TABLE `scheduled_workouts`;
--> statement-breakpoint
ALTER TABLE `__new_scheduled_workouts` RENAME TO `scheduled_workouts`;
--> statement-breakpoint
CREATE INDEX `idx_sw_date` ON `scheduled_workouts` (`scheduled_date`);
--> statement-breakpoint
CREATE INDEX `idx_sw_routine` ON `scheduled_workouts` (`routine_id`);
--> statement-breakpoint
CREATE TABLE `scheduled_workout_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheduled_workout_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_swe_schedule` ON `scheduled_workout_exercises` (`scheduled_workout_id`);
