import type { Reminder } from '@/db/schema';

export type ReminderKind =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
  | 'interval'
  | 'month_interval';

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
  enabled: boolean;
};

export type ParsedReminder = Omit<Reminder, 'weekdays' | 'monthdays'> & {
  weekdays: number[] | null;
  monthdays: number[] | null;
};
