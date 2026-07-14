// リマインダーのスケジュール計算(トリガー種別判定・日付計算)を担う純粋関数群。
// db/client(expo-sqlite)を一切importしないことがこのファイルの存在意義で、
// Jest環境で動かせないexpo-sqlite抜きにこれらの計算だけを再利用・テストできるようにする
// （lib/routines/reminder-input.tsのルーティンフォーム向けプレビュー計算等）。
// DB書き込みを伴うCRUD(createReminder等)はlib/notifications/scheduler.tsに残し、
// そちらはこのファイルをre-exportして既存の呼び出し側との互換を保つ。
import {
  MONTH_END,
  type ParsedReminder,
  type ReminderInput,
  type ReminderKind,
} from './types';

// ── 定数 ────────────────────────────────────────────
export const QUEUE_DEPTH_BIWEEKLY = 8;
export const QUEUE_DEPTH_INTERVAL = 14;
export const QUEUE_DEPTH_YEARLY = 3;
export const QUEUE_DEPTH_MONTHLY_EOM = 8;
export const REFILL_THRESHOLD = 3;
export const MAX_OS_NOTIFICATIONS = 60;

// ── 入力正規化 ───────────────────────────────────────

export function normalizeInput(input: ReminderInput): ReminderInput {
  let result = { ...input };

  // monthly/yearly: 月末(99)がある場合、29〜31 は月末と重複するため除外
  if ((result.kind === 'monthly' || result.kind === 'yearly') && result.monthdays) {
    const hasEom = result.monthdays.includes(MONTH_END);
    if (hasEom) {
      result = {
        ...result,
        monthdays: result.monthdays.filter((d) => d < 29 || d === MONTH_END),
      };
    }
  }

  return result;
}

// ── トリガー種別判定 ─────────────────────────────────

export type TriggerType = 'native' | 'queue';

export function resolveTriggerType(r: ParsedReminder): TriggerType {
  const { kind, monthdays } = r;
  if (kind === 'interval') return (r.intervalDays ?? 1) === 1 ? 'native' : 'queue';
  if (kind === 'weekly') return (r.intervalDays ?? 7) === 7 ? 'native' : 'queue';
  if (kind === 'monthly') {
    if ((r.intervalMonths ?? 1) > 1) return 'queue';
    if (r.nthWeek != null) return 'queue';
    if (!monthdays) return 'queue';
    const needsQueue = monthdays.some((d) => d === MONTH_END || d >= 29);
    return needsQueue ? 'queue' : 'native';
  }
  return 'queue'; // yearly
}

export function queueDepthFor(kind: ReminderKind): number {
  if (kind === 'weekly') return QUEUE_DEPTH_BIWEEKLY;
  if (kind === 'interval') return QUEUE_DEPTH_INTERVAL;
  if (kind === 'yearly') return QUEUE_DEPTH_YEARLY;
  return QUEUE_DEPTH_MONTHLY_EOM; // monthly (queue)
}

export function computeQuotaPerReminder(queueReminderCount: number): number {
  if (queueReminderCount === 0) return QUEUE_DEPTH_INTERVAL;
  return Math.max(1, Math.floor(MAX_OS_NOTIFICATIONS / queueReminderCount));
}

// ── 純粋関数（日付計算）─────────────────────────────

function setHM(date: Date, hour: number, minute: number): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function resolveMonthDay(
  year: number,
  month: number, // 0-indexed
  day: number,
): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day === MONTH_END || day > lastDay) return lastDay;
  return day;
}

// 第N曜日の日付を返す。その月に存在しない場合は null
export function resolveNthWeekdayDay(
  year: number,
  month: number, // 0-indexed
  nthWeek: number, // 1〜4, -1=最終
  weekday: number, // 0=日〜6=土
): number | null {
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (nthWeek === -1) {
    const lastDayWD = new Date(year, month, lastDay).getDay();
    return lastDay - ((lastDayWD - weekday + 7) % 7);
  }
  const firstDayWD = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - firstDayWD + 7) % 7) + (nthWeek - 1) * 7;
  return day <= lastDay ? day : null;
}

export function computeNthWeekdayFireDates(
  from: Date,
  nthWeek: number,
  weekdays: number[],
  hour: number,
  minute: number,
  count: number,
  intervalMonths = 1,
  anchorDate?: number,
): Date[] {
  const results: Date[] = [];
  let year: number;
  let month: number;

  if (intervalMonths === 1) {
    year = from.getFullYear();
    month = from.getMonth();
  } else {
    const anchor = anchorDate ? new Date(anchorDate) : from;
    const anchorYear = anchor.getFullYear();
    const anchorMonth = anchor.getMonth();
    const monthsFromAnchor =
      (from.getFullYear() - anchorYear) * 12 + (from.getMonth() - anchorMonth);
    const n = Math.max(0, Math.floor(monthsFromAnchor / intervalMonths));
    const totalMonths = anchorMonth + n * intervalMonths;
    year = anchorYear + Math.floor(totalMonths / 12);
    month = ((totalMonths % 12) + 12) % 12;
  }

  let guard = 0;
  while (results.length < count && guard < 200) {
    guard++;
    for (const weekday of weekdays) {
      const day = resolveNthWeekdayDay(year, month, nthWeek, weekday);
      if (day !== null) {
        const candidate = new Date(year, month, day, hour, minute, 0, 0);
        if (candidate > from) results.push(candidate);
      }
    }
    const totalMonths = month + intervalMonths;
    year += Math.floor(totalMonths / 12);
    month = totalMonths % 12;
    if (year > from.getFullYear() + 20) break;
  }
  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

export function nextDailyFireDate(
  from: Date,
  hour: number,
  minute: number,
): Date {
  const candidate = setHM(from, hour, minute);
  if (candidate > from) return candidate;
  return new Date(candidate.getTime() + 86400000);
}

export function nextWeeklyFireDate(
  from: Date,
  weekdays: number[],
  hour: number,
  minute: number,
): Date {
  const sorted = [...weekdays].sort((a, b) => a - b);
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(from.getTime() + offset * 86400000);
    const wd = d.getDay();
    if (!sorted.includes(wd)) continue;
    const candidate = setHM(d, hour, minute);
    if (candidate > from) return candidate;
  }
  // fallback (should not reach)
  const d = new Date(from);
  d.setDate(d.getDate() + 7);
  return setHM(d, hour, minute);
}

export function computeBiweeklyFireDates(
  from: Date,
  anchorDate: number,
  weekday: number,
  hour: number,
  minute: number,
  count: number,
  intervalWeeks = 2,
): Date[] {
  const anchor = new Date(anchorDate);
  const anchorSunday = new Date(anchor);
  anchorSunday.setDate(anchor.getDate() - anchor.getDay());
  anchorSunday.setHours(0, 0, 0, 0);

  const results: Date[] = [];
  const d = new Date(from);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);

  while (results.length < count) {
    const weekDiff = Math.round(
      (d.getTime() - anchorSunday.getTime()) / (7 * 86400000),
    );
    if (weekDiff % intervalWeeks === 0) {
      const target = new Date(d);
      target.setDate(d.getDate() + weekday);
      const candidate = setHM(target, hour, minute);
      if (candidate > from) results.push(candidate);
    }
    d.setDate(d.getDate() + 7);
    if (d.getFullYear() > from.getFullYear() + 2) break;
  }
  return results;
}

export function computeIntervalFireDates(
  from: Date,
  anchorDate: number,
  intervalDays: number,
  hour: number,
  minute: number,
  count: number,
): Date[] {
  const anchor = setHM(new Date(anchorDate), hour, minute);
  const ms = intervalDays * 86400000;
  // anchor から何周期目か
  const diff = from.getTime() - anchor.getTime();
  const cycles = diff > 0 ? Math.ceil(diff / ms) : 0;
  const results: Date[] = [];
  let n = cycles;
  while (results.length < count) {
    const candidate = new Date(anchor.getTime() + n * ms);
    if (candidate > from) results.push(candidate);
    n++;
    if (n > cycles + count + 10) break;
  }
  return results;
}

export function computeYearlyFireDates(
  from: Date,
  anchorMonth: number, // 0-indexed
  anchorDays: number[],
  hour: number,
  minute: number,
  count: number,
): Date[] {
  const results: Date[] = [];
  let year = from.getFullYear();
  while (results.length < count) {
    for (const anchorDay of anchorDays) {
      const day = resolveMonthDay(year, anchorMonth, anchorDay);
      const candidate = new Date(year, anchorMonth, day, hour, minute, 0, 0);
      if (candidate > from) results.push(candidate);
    }
    year++;
    if (year > from.getFullYear() + 10) break;
  }
  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

export function computeMonthIntervalFireDates(
  from: Date,
  anchorDate: number,
  intervalMonths: number,
  days: number[],
  hour: number,
  minute: number,
  count: number,
): Date[] {
  const anchor = new Date(anchorDate);
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();
  const monthsFromAnchor =
    (from.getFullYear() - anchorYear) * 12 + (from.getMonth() - anchorMonth);
  const startN = Math.floor(monthsFromAnchor / intervalMonths);
  let n = startN;

  const results: Date[] = [];
  while (results.length < count) {
    const totalMonths = anchorMonth + n * intervalMonths;
    const year = anchorYear + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    for (const day of days) {
      const resolved = resolveMonthDay(year, month, day);
      const candidate = new Date(year, month, resolved, hour, minute, 0, 0);
      if (candidate > from) results.push(candidate);
    }
    n++;
    if (n > startN + count + 50) break;
  }
  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

export function computeMonthlyQueueFireDates(
  from: Date,
  monthdays: number[],
  hour: number,
  minute: number,
  count: number,
): Date[] {
  const results: Date[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();

  while (results.length < count) {
    for (const day of monthdays) {
      const resolved = resolveMonthDay(year, month, day);
      const candidate = new Date(year, month, resolved, hour, minute, 0, 0);
      if (candidate > from) results.push(candidate);
    }
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    if (year > from.getFullYear() + 5) break;
  }

  return results.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

export function getNextFireDate(r: ParsedReminder, from: Date): Date | null {
  const { kind, hour, minute } = r;
  try {
    if (kind === 'interval') {
      const n = r.intervalDays ?? 1;
      if (n === 1) return nextDailyFireDate(from, hour, minute);
      if (!r.anchorDate) return null;
      return computeIntervalFireDates(from, r.anchorDate, n, hour, minute, 1)[0] ?? null;
    }
    if (kind === 'weekly') {
      if (!r.weekdays?.length) return null;
      const idays = r.intervalDays ?? 7;
      if (idays === 7) return nextWeeklyFireDate(from, r.weekdays, hour, minute);
      if (!r.anchorDate) return null;
      const iw = Math.max(1, Math.round(idays / 7));
      const all: Date[] = [];
      for (const wd of r.weekdays) {
        const d = computeBiweeklyFireDates(from, r.anchorDate, wd, hour, minute, 1, iw);
        if (d[0]) all.push(d[0]);
      }
      return all.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    }
    if (kind === 'monthly') {
      const intervalMonths = r.intervalMonths ?? 1;
      if (r.nthWeek != null) {
        if (!r.nthWeekdays?.length) return null;
        return computeNthWeekdayFireDates(
          from, r.nthWeek, r.nthWeekdays, hour, minute, 1, intervalMonths, r.anchorDate ?? undefined,
        )[0] ?? null;
      }
      if (!r.monthdays?.length) return null;
      if (intervalMonths === 1) {
        return computeMonthlyQueueFireDates(from, r.monthdays, hour, minute, 1)[0] ?? null;
      }
      if (!r.anchorDate) return null;
      return computeMonthIntervalFireDates(
        from, r.anchorDate, intervalMonths, r.monthdays, hour, minute, 1,
      )[0] ?? null;
    }
    if (kind === 'yearly') {
      if (!r.anchorDate || !r.monthdays?.length) return null;
      const a = new Date(r.anchorDate);
      return computeYearlyFireDates(from, a.getMonth(), r.monthdays, hour, minute, 1)[0] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

// ── ヘルパー ─────────────────────────────────────────

// parseReminder/resolveLegacyYearlyMonthdaysはReminder(db/schema)の生の行を扱うため
// このファイルでは持たず、scheduler.ts側に残す(db/schemaの型はimportしても実害は無いが、
// 「DB行を直接扱うものはscheduler.ts、扱わない純粋計算はこちら」という分担を保つため)
