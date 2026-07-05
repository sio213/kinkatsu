import type { Reminder } from '@/db/schema';
import { MONTH_END, type ReminderKind } from './types';

export const KIND_LABELS: Record<ReminderKind, string> = {
  interval: '毎日',
  weekly: '毎週',
  monthly: '毎月',
  yearly: '毎年',
};

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const NTH_WEEK_OPTIONS: { label: string; value: number }[] = [
  { label: '第1', value: 1 },
  { label: '第2', value: 2 },
  { label: '第3', value: 3 },
  { label: '第4', value: 4 },
  { label: '最終', value: -1 },
];

type ReminderPreset = { label: string; weekdays: number[] | null };

export const REMINDER_PRESETS: ReminderPreset[] = [
  { label: '毎日',    weekdays: null },
  { label: '月水金',  weekdays: [1, 3, 5] },
  { label: '火木土',  weekdays: [2, 4, 6] },
  { label: '週末のみ', weekdays: [0, 6] },
];

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

function formatRelativeDay(date: Date, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '明日';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

export function formatNextFire(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—';
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `次回: ${formatRelativeDay(date, now)} ${h}:${min}`;
}

export function formatKindSummary(r: Reminder): string {
  const kind = r.kind as ReminderKind;
  const h = String(r.hour).padStart(2, '0');
  const m = String(r.minute).padStart(2, '0');
  const time = `${h}:${m}`;

  if (kind === 'interval') {
    const n = r.intervalDays ?? 1;
    return n === 1 ? `毎日 ${time}` : `${n}日ごと ${time}`;
  }
  if (kind === 'weekly') {
    const wds: number[] = r.weekdays ? JSON.parse(r.weekdays) : [];
    const wdLabel = wds.map((d) => WEEKDAY_LABELS[d]).join('・');
    const n = Math.max(1, Math.round((r.intervalDays ?? 7) / 7));
    return n === 1 ? `毎週 ${wdLabel} ${time}` : `${n}週ごと ${wdLabel} ${time}`;
  }
  if (kind === 'monthly') {
    const n = r.intervalMonths ?? 1;
    const prefix = n === 1 ? '毎月' : `${n}ヶ月ごと`;
    if (r.nthWeek != null && r.nthWeekday != null) {
      const weekLabel = NTH_WEEK_OPTIONS.find((o) => o.value === r.nthWeek)?.label ?? `第${r.nthWeek}`;
      return `${prefix}${weekLabel}${WEEKDAY_LABELS[r.nthWeekday]}曜日 ${time}`;
    }
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    const dayLabel = mds.map((d) => (d === MONTH_END ? '月末' : `${d}日`)).join('・');
    return `${prefix} ${dayLabel} ${time}`;
  }
  if (kind === 'yearly' && r.anchorDate) {
    const a = new Date(r.anchorDate);
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    const dayLabel = mds.includes(MONTH_END) ? '月末' : `${a.getDate()}日`;
    return `毎年 ${a.getMonth() + 1}月${dayLabel} ${time}`;
  }
  return time;
}
