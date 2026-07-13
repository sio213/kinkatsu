import { DEFAULT_REMINDER_BODY } from '@/lib/notifications/messages';
import type { ReminderInput } from '@/lib/notifications/types';

// ルーティンフォームのリマインダーセクションはタイトル・本文の入力欄を持たず、保存のたびに
// 現在のルーティン名から自動生成する。OSのローカル通知は登録した時点のtitle/bodyをそのまま
// 発火時にも使う（発火時にDBを引き直す仕組みが無い）ため、「常に最新のルーティン名を反映する」は
// 「ルーティンを保存するたびにこの関数を通してtitle/bodyを作り直し、再登録する」ことで実現する
export function withRoutineReminderContent(
  input: ReminderInput,
  routineId: number,
  routineName: string,
): ReminderInput {
  return { ...input, routineId, title: routineName, body: DEFAULT_REMINDER_BODY };
}
