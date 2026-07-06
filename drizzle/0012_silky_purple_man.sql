-- setsに workout_session_exercise_id を追加する。SQLiteはNOT NULL制約の追加にテーブル再作成が
-- 必要なため、新テーブルへ既存データをコピーしながら (session_id, exercise_id) の一致で
-- workout_session_exercise_id をバックフィルする。旧仕様では同一セッション内で種目が重複しない
-- 前提だったため、この一致は一意に定まる。
-- 注意: 対応するworkout_session_exercises行が1件も無い「孤児」setsが存在すると、
-- サブクエリがNULLを返しNOT NULL制約違反でこのマイグレーション自体が失敗する
-- （＝アプリが起動不能になる）。addSetは常にsessionExerciseId経由でwse行作成後にのみ
-- setsを作るため、実運用でこの状態のデータが作られることはない。
CREATE TABLE `__new_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`workout_session_exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`duration_seconds` integer,
	`distance_meters` real,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workout_session_exercise_id`) REFERENCES `workout_session_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sets` (`id`, `session_id`, `exercise_id`, `workout_session_exercise_id`, `set_number`, `weight`, `reps`, `duration_seconds`, `distance_meters`, `completed_at`, `created_at`)
SELECT
	`s`.`id`, `s`.`session_id`, `s`.`exercise_id`,
	(SELECT `wse`.`id` FROM `workout_session_exercises` `wse` WHERE `wse`.`session_id` = `s`.`session_id` AND `wse`.`exercise_id` = `s`.`exercise_id` LIMIT 1),
	`s`.`set_number`, `s`.`weight`, `s`.`reps`, `s`.`duration_seconds`, `s`.`distance_meters`, `s`.`completed_at`, `s`.`created_at`
FROM `sets` `s`;
--> statement-breakpoint
DROP TABLE `sets`;
--> statement-breakpoint
ALTER TABLE `__new_sets` RENAME TO `sets`;
--> statement-breakpoint
CREATE INDEX `idx_sets_session` ON `sets` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_sets_exercise` ON `sets` (`exercise_id`);
--> statement-breakpoint
CREATE INDEX `idx_sets_wse` ON `sets` (`workout_session_exercise_id`);
