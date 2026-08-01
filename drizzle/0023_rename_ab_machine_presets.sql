-- プリセット種目「アブドミナルクランチ（マシン）」「トーソローテーション（マシン）」を、
-- マスタ内の他のマシン種目と同じ接尾辞表記（○○マシン）へ揃える。
--
-- db/seed.ts の seed() は既存行の category / measurement_type / paired_weights しか同期せず
-- name は触らない。プリセット種目も詳細画面の⋮「編集」から改名できる仕様のため、seed() が
-- name を上書きすると「ベンチプレス」を「BP」に直したユーザーの変更を毎起動で握り潰して
-- しまうからで、これは意図的な仕様。そのぶん、マスタ側の改名は個別のマイグレーションで運ぶ。
--
-- WHERE で旧名を明示しているのは、自分で改名済みのユーザーの行に当てないため
-- （slug だけを条件にすると、その人が付けた名前を奪ってしまう）。
UPDATE `exercises` SET `name` = 'アブドミナルクランチマシン', `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE `source` = 'preset' AND `slug` = 'machine_crunch' AND `name` = 'アブドミナルクランチ（マシン）';
--> statement-breakpoint
UPDATE `exercises` SET `name` = 'トーソローテーションマシン', `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE `source` = 'preset' AND `slug` = 'torso_rotation_machine' AND `name` = 'トーソローテーション（マシン）';
