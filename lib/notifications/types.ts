import type { Reminder } from '@/db/schema';

export type ReminderKind = 'interval' | 'weekly' | 'monthly' | 'yearly';

export type TriggerType = 'native' | 'queue';

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
  nthWeekday?: number; // monthly/month_interval: 曜日 (0=日〜6=土)
  enabled: boolean;
};

export type ParsedReminder = Omit<Reminder, 'weekdays' | 'monthdays'> & {
  weekdays: number[] | null;
  monthdays: number[] | null;
};
