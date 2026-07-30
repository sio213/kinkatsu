-- サンプル記録の削除。外部キーの向きに合わせて子から消す。
-- Drizzle Studioで実行するときは、この3行を上から1行ずつ流すこと（1回に1文しか実行されない）。
DELETE FROM sets WHERE id >= 900001;
DELETE FROM workout_session_exercises WHERE id >= 900001;
DELETE FROM workout_sessions WHERE id >= 900001;
