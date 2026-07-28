-- サンプル記録の削除。外部キーの向きに合わせて子から消す
DELETE FROM sets WHERE id >= 900001;
DELETE FROM workout_session_exercises WHERE id >= 900001;
DELETE FROM workout_sessions WHERE id >= 900001;
