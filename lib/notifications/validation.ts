import type { Reminder } from '@/db/schema';
import { z } from 'zod';
import type { ReminderInput, ReminderKind } from './types';

// ReminderFormは「日単位/週単位/月単位/年単位」の4モードを1画面で切り替える構造上、
// 選択中でないモードのフィールドも常にフォーム値として保持する（例: 週単位を選んでいる間も
// monthdays等は初期値のまま持つ）。送信直前にtoReminderInputで選択中のkindに応じた
// ReminderInputへ変換し、モード外のフィールドは持たせない
export const reminderFormSchema = z
  .object({
    title: z.string().trim().min(1, 'タイトルを入力してください'),
    body: z.string().trim().min(1, '通知内容を入力してください'),
    kind: z.enum(['interval', 'weekly', 'monthly', 'yearly']),
    hour: z.number(),
    minute: z.number(),
    enabled: z.boolean(),
    anchorDate: z.number().optional(),

    // 日単位
    intervalDays: z.number().min(1).max(365),

    // 週単位
    intervalWeeks: z.number().min(1).max(8),
    weekdays: z.array(z.number()),

    // 月単位
    intervalMonths: z.number().min(1).max(12),
    monthDayMode: z.enum(['day', 'nth']),
    // 「日付」指定（intervalMonths===1の毎月・>1のNヶ月ごと共通）の複数選択で使う
    monthdays: z.array(z.number()),
    monthNthWeek: z.number(),
    // 第N曜日の曜日指定（複数選択可）。毎週の曜日選択と同じくデフォルト値のない複数選択
    monthNthWeekdays: z.array(z.number()),

    // 年単位
    yearlyMonth: z.number(),
    // 「日」指定（複数選択可）。毎月の日付選択と同じくデフォルト値のない複数選択
    yearlyDays: z.array(z.number()),
  })
  // 週次の曜日・毎月の日付はデフォルト値のない複数選択のため、0件のまま保存すると
  // getNextFireDateがnullを返し二度と発火しないリマインダーになってしまう
  .refine((v) => v.kind !== 'weekly' || v.weekdays.length > 0, {
    message: '曜日を1つ以上選択してください',
    path: ['weekdays'],
  })
  .refine(
    (v) => v.kind !== 'monthly' || v.monthDayMode !== 'day' || v.monthdays.length > 0,
    { message: '日付を1つ以上選択してください', path: ['monthdays'] },
  )
  .refine(
    (v) => v.kind !== 'monthly' || v.monthDayMode !== 'nth' || v.monthNthWeekdays.length > 0,
    { message: '曜日を1つ以上選択してください', path: ['monthNthWeekdays'] },
  )
  .refine((v) => v.kind !== 'yearly' || v.yearlyDays.length > 0, {
    message: '日付を1つ以上選択してください',
    path: ['yearlyDays'],
  });

export type ReminderFormValues = z.infer<typeof reminderFormSchema>;

// DB行(Reminder)をReminderForm/toFormValuesが読めるReminderInputへ変換する。
// components/reminders/reminder-card.tsxの編集フォーム、ルーティンフォームの
// リマインダーセクション(既存ルーティン編集時の初期値復元)の両方から使う
export function buildEditInput(r: Reminder): ReminderInput {
  return {
    // ルーティン由来のリマインダー(routineId有り)を編集・保存する経路がここに来た場合でも
    // 紐付けを保つため引き継ぐ。省略するとupdateReminder側でnull扱いになり、保存のたびに
    // ルーティンとの紐付けが切れてしまう
    routineId: r.routineId,
    title: r.title,
    body: r.body,
    kind: r.kind as ReminderKind,
    hour: r.hour,
    minute: r.minute,
    weekdays: r.weekdays ? JSON.parse(r.weekdays) : undefined,
    // monthdays未設定の毎年は、以前anchorDateに発火日そのものをエンコードしていた旧形式のデータ
    monthdays: r.monthdays
      ? JSON.parse(r.monthdays)
      : r.kind === 'yearly' && r.anchorDate
        ? [new Date(r.anchorDate).getDate()]
        : undefined,
    anchorDate: r.anchorDate ?? undefined,
    intervalDays: r.intervalDays ?? undefined,
    intervalMonths: r.intervalMonths ?? undefined,
    nthWeek: r.nthWeek ?? undefined,
    nthWeekdays: r.nthWeekdays ? JSON.parse(r.nthWeekdays) : undefined,
    enabled: r.enabled,
  };
}

export function toFormValues(input: ReminderInput): ReminderFormValues {
  const anchor = input.anchorDate ? new Date(input.anchorDate) : null;
  const intervalMonths = input.kind === 'monthly' ? (input.intervalMonths ?? 1) : 1;

  return {
    title: input.title,
    body: input.body,
    kind: input.kind,
    hour: input.hour,
    minute: input.minute,
    enabled: input.enabled,
    anchorDate: input.anchorDate,

    intervalDays: input.kind === 'interval' ? (input.intervalDays ?? 1) : 1,

    intervalWeeks: input.kind === 'weekly' ? Math.max(1, Math.round((input.intervalDays ?? 7) / 7)) : 1,
    weekdays: input.weekdays ?? [],

    intervalMonths,
    monthDayMode: input.kind === 'monthly' && input.nthWeek != null ? 'nth' : 'day',
    monthdays: input.kind === 'monthly' && input.nthWeek == null ? (input.monthdays ?? []) : [],
    monthNthWeek: input.kind === 'monthly' ? (input.nthWeek ?? 1) : 1,
    monthNthWeekdays: input.kind === 'monthly' && input.nthWeek != null ? (input.nthWeekdays ?? []) : [],

    yearlyMonth: anchor?.getMonth() ?? 0,
    yearlyDays: input.kind === 'yearly' ? (input.monthdays ?? []) : [],
  };
}

export function toReminderInput(values: ReminderFormValues): ReminderInput {
  const out: ReminderInput = {
    title: values.title,
    body: values.body,
    kind: values.kind,
    hour: values.hour,
    minute: values.minute,
    enabled: values.enabled,
    anchorDate: values.anchorDate,
  };

  if (values.kind === 'interval') {
    out.intervalDays = values.intervalDays;
    if (values.intervalDays > 1) out.anchorDate = out.anchorDate ?? Date.now();
  }

  if (values.kind === 'weekly') {
    out.weekdays = values.weekdays;
    out.intervalDays = values.intervalWeeks * 7;
    if (values.intervalWeeks > 1) out.anchorDate = out.anchorDate ?? Date.now();
  }

  if (values.kind === 'yearly') {
    // 実際の発火日はmonthdays(複数選択可)側で持つため、anchorDateは月の特定にのみ使う
    out.anchorDate = new Date(new Date().getFullYear(), values.yearlyMonth, 1).getTime();
    out.monthdays = values.yearlyDays;
  }

  if (values.kind === 'monthly') {
    out.intervalMonths = values.intervalMonths;
    if (values.monthDayMode === 'nth') {
      out.nthWeek = values.monthNthWeek;
      out.nthWeekdays = values.monthNthWeekdays;
    } else {
      out.monthdays = values.monthdays;
      if (values.intervalMonths > 1) out.anchorDate = out.anchorDate ?? Date.now();
    }
  }

  return out;
}
