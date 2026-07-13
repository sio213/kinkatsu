import type { Reminder } from '@/db/schema';
import { formatKindSummary } from '@/lib/notifications/format';
import { DEFAULT_REMINDER_BODY } from '@/lib/notifications/messages';
// db/client(expo-sqlite)を持たないschedule-math.tsから直接importする。scheduler.tsは
// createReminder等のDB書き込みのためdb/clientをimportしており、経由するとJestで
// 動かせなくなる(expo-sqliteの依存解決に失敗する)ため
import { getNextFireDate } from '@/lib/notifications/schedule-math';
import type { ParsedReminder, ReminderInput } from '@/lib/notifications/types';

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

// formatKindSummary/getNextFireDateはどちらもDB行(id/title/body等を含む型)を受け取るが、
// 実際に読むのはスケジュール関連のフィールドのみ。ルーティンフォームはDBに保存する前の
// ReminderInputの段階で頻度の要約・次回発火時刻をプレビュー表示したいため、
// 必要なフィールドだけを組み立てて安全にキャストする
function toScheduleFields(input: ReminderInput) {
  return {
    kind: input.kind,
    hour: input.hour,
    minute: input.minute,
    anchorDate: input.anchorDate ?? null,
    intervalDays: input.intervalDays ?? null,
    intervalMonths: input.intervalMonths ?? null,
    nthWeek: input.nthWeek ?? null,
  };
}

export function previewReminderSummary(input: ReminderInput): string {
  return formatKindSummary({
    ...toScheduleFields(input),
    weekdays: input.weekdays ? JSON.stringify(input.weekdays) : null,
    monthdays: input.monthdays ? JSON.stringify(input.monthdays) : null,
    nthWeekdays: input.nthWeekdays ? JSON.stringify(input.nthWeekdays) : null,
  } as Reminder);
}

export function previewNextFireDate(input: ReminderInput, from: Date): Date | null {
  return getNextFireDate(
    {
      ...toScheduleFields(input),
      weekdays: input.weekdays ?? null,
      monthdays: input.monthdays ?? null,
      nthWeekdays: input.nthWeekdays ?? null,
    } as ParsedReminder,
    from,
  );
}
