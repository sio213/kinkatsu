-- 第N曜日の曜日指定を単一選択(nth_weekday: integer)から複数選択(nth_weekdays: JSON配列)に変更する。
-- 列をリネームした上で、既存の単一値(例: 3)をJSON配列(例: [3])へ変換する。
-- SQLiteは列の型変化を強制しない(manifest typing)ため、integer宣言のまま配列文字列を
-- 格納してもTEXTストレージクラスとして保存され、後続のdrizzleスキーマ側でtext列として
-- 読み書きすれば問題ない。
ALTER TABLE `reminders` RENAME COLUMN `nth_weekday` TO `nth_weekdays`;--> statement-breakpoint
UPDATE `reminders` SET `nth_weekdays` = '[' || `nth_weekdays` || ']' WHERE `nth_weekdays` IS NOT NULL;
