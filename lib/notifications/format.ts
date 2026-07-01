import type { Reminder } from '@/db/schema';
import { MONTH_END, type ReminderKind } from './types';

export const KIND_LABELS: Record<ReminderKind, string> = {
  daily: '毎日',
  weekly: '毎週',
  biweekly: 'N週ごと',
  monthly: '毎月',
  month_interval: 'Nヶ月ごと',
  yearly: '毎年',
  interval: 'N日ごと',
};

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const NTH_WEEK_OPTIONS: { label: string; value: number }[] = [
  { label: '第1', value: 1 },
  { label: '第2', value: 2 },
  { label: '第3', value: 3 },
  { label: '第4', value: 4 },
  { label: '最終', value: -1 },
];

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

export function formatNextFire(date: Date | null): string {
  if (!date) return '—';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `次回: ${m}/${d} ${h}:${min}`;
}

export function formatKindSummary(r: Reminder): string {
  const kind = r.kind as ReminderKind;
  const h = String(r.hour).padStart(2, '0');
  const m = String(r.minute).padStart(2, '0');
  const time = `${h}:${m}`;

  if (kind === 'daily') return `毎日 ${time}`;
  if (kind === 'weekly') {
    const wds: number[] = r.weekdays ? JSON.parse(r.weekdays) : [];
    return `毎週 ${wds.map((d) => WEEKDAY_LABELS[d]).join('・')} ${time}`;
  }
  if (kind === 'biweekly') {
    const wds: number[] = r.weekdays ? JSON.parse(r.weekdays) : [];
    const weeks = r.intervalDays ? Math.round(r.intervalDays / 7) : 2;
    return `${weeks}週間ごと ${wds.map((d) => WEEKDAY_LABELS[d]).join('・')} ${time}`;
  }
  if (kind === 'monthly') {
    if (r.nthWeek != null && r.nthWeekday != null) {
      const weekLabel = NTH_WEEK_OPTIONS.find((o) => o.value === r.nthWeek)?.label ?? `第${r.nthWeek}`;
      return `毎月${weekLabel}${WEEKDAY_LABELS[r.nthWeekday]}曜日 ${time}`;
    }
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    return `毎月 ${mds.map((d) => (d === MONTH_END ? '月末' : `${d}日`)).join('・')} ${time}`;
  }
  if (kind === 'yearly' && r.anchorDate) {
    const a = new Date(r.anchorDate);
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    const dayLabel = mds.includes(MONTH_END) ? '月末' : `${a.getDate()}日`;
    return `毎年 ${a.getMonth() + 1}月${dayLabel} ${time}`;
  }
  if (kind === 'interval') return `${r.intervalDays ?? 2}日ごと ${time}`;
  if (kind === 'month_interval') {
    const months = r.intervalMonths ?? 2;
    if (r.nthWeek != null && r.nthWeekday != null) {
      const weekLabel = NTH_WEEK_OPTIONS.find((o) => o.value === r.nthWeek)?.label ?? `第${r.nthWeek}`;
      return `${months}ヶ月ごと${weekLabel}${WEEKDAY_LABELS[r.nthWeekday]}曜日 ${time}`;
    }
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    const dayLabel = mds[0] === MONTH_END ? '月末' : `${mds[0] ?? 1}日`;
    return `${months}ヶ月ごと ${dayLabel} ${time}`;
  }
  return time;
}
