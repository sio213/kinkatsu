import { z } from 'zod';
import { resolveMonthDay } from './scheduler';
import { MONTH_END, type ReminderInput } from './types';

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
    monthNthWeekday: z.number(),

    // 年単位
    yearlyMonth: z.number(),
    yearlyDay: z.number(),
    yearlyEom: z.boolean(),
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
  );

export type ReminderFormValues = z.infer<typeof reminderFormSchema>;

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
    monthNthWeekday: input.kind === 'monthly' ? (input.nthWeekday ?? 1) : 1,

    yearlyMonth: anchor?.getMonth() ?? 0,
    yearlyDay: anchor?.getDate() ?? 1,
    yearlyEom: input.kind === 'yearly' && (input.monthdays?.includes(MONTH_END) ?? false),
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
    const now = new Date();
    const yr = now.getFullYear();
    if (values.yearlyEom) {
      out.anchorDate = new Date(yr, values.yearlyMonth, 1).getTime();
      out.monthdays = [MONTH_END];
    } else {
      const day = resolveMonthDay(yr, values.yearlyMonth, values.yearlyDay);
      let d = new Date(yr, values.yearlyMonth, day);
      if (d <= now) {
        const dayNext = resolveMonthDay(yr + 1, values.yearlyMonth, values.yearlyDay);
        d = new Date(yr + 1, values.yearlyMonth, dayNext);
      }
      out.anchorDate = d.getTime();
    }
  }

  if (values.kind === 'monthly') {
    out.intervalMonths = values.intervalMonths;
    if (values.monthDayMode === 'nth') {
      out.nthWeek = values.monthNthWeek;
      out.nthWeekday = values.monthNthWeekday;
    } else {
      out.monthdays = values.monthdays;
      if (values.intervalMonths > 1) out.anchorDate = out.anchorDate ?? Date.now();
    }
  }

  return out;
}
