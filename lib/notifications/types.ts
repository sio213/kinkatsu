import type { Reminder } from '@/db/schema';

export type ReminderKind = 'interval' | 'weekly' | 'monthly' | 'yearly';

// トリガー種別(native/queue)はスケジュール計算(lib/notifications/schedule-math.ts)側の
// 概念のためそちらで定義する。ここでは持たない

// monthdays 内で月末を表す番兵値
export const MONTH_END = 99 as const;

export type ReminderInput = {
  title: string;
  body: string;
  kind: ReminderKind;
  hour: number;
  minute: number;
  weekdays?: number[]; // weekly/biweekly: 0=日〜6=土
  monthdays?: number[]; // monthly: 1-31, 99=月末
  anchorDate?: number; // biweekly/yearly/interval の起点 epoch ms
  intervalDays?: number; // interval のみ
  intervalMonths?: number; // month_interval のみ
  nthWeek?: number; // monthly/month_interval: 第N週 (1〜4, -1=最終)
  nthWeekdays?: number[]; // monthly/month_interval: 曜日(複数選択可) 0=日〜6=土
  enabled: boolean;
  // ルーティンフォームから作成/更新するリマインダーのみ設定する。単体リマインダー(通常の
  // リマインダータブからの作成)ではundefined（=null保存）のまま
  routineId?: number | null;
};

export type ParsedReminder = Omit<Reminder, 'weekdays' | 'monthdays' | 'nthWeekdays'> & {
  weekdays: number[] | null;
  monthdays: number[] | null;
  nthWeekdays: number[] | null;
};

// 通知タップ時の遷移先判定に使う識別子。scheduler側（生成）とタップハンドラ側（消費）で共有する
export const REMINDER_NOTIFICATION_TYPE = 'reminder' as const;

export type ReminderNotificationData = {
  type: typeof REMINDER_NOTIFICATION_TYPE;
  reminderId: number;
};

// カレンダーの手動予定（scheduledWorkouts、PR10-5）の通知。繰り返しリマインダーと違い1レコード=
// 1回のみの通知のため、タップ時にDBを引き直さずに済むようroutineIdをdataへ直接埋め込む
export const SCHEDULED_WORKOUT_NOTIFICATION_TYPE = 'scheduled_workout' as const;

export type ScheduledWorkoutNotificationData = {
  type: typeof SCHEDULED_WORKOUT_NOTIFICATION_TYPE;
  routineId: number;
};
