import { db } from '@/db/client';
import {
  reminderNotifications,
  reminders,
  type NewReminder,
  type Reminder,
} from '@/db/schema';
import { and, eq, gt, lte } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { REMINDER_CHANNEL_ID } from './channels';
import {
  MONTH_END,
  REMINDER_NOTIFICATION_TYPE,
  type ParsedReminder,
  type ReminderInput,
  type ReminderKind,
  type ReminderNotificationData,
  type TriggerType,
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

export function parseReminder(r: Reminder): ParsedReminder {
  return {
    ...r,
    weekdays: r.weekdays ? JSON.parse(r.weekdays) : null,
    monthdays: r.monthdays ? JSON.parse(r.monthdays) : resolveLegacyYearlyMonthdays(r),
    nthWeekdays: r.nthWeekdays ? JSON.parse(r.nthWeekdays) : null,
  };
}

// 毎年(日付指定・月末以外)は以前monthdaysを保存せずanchorDateに発火日そのものを
// エンコードしていた。当時保存された既存データが二度と発火しなくなるのを防ぐため、
// monthdays未設定のyearlyだけanchorDateの日から復元する
function resolveLegacyYearlyMonthdays(r: Reminder): number[] | null {
  if (r.kind === 'yearly' && r.anchorDate) return [new Date(r.anchorDate).getDate()];
  return null;
}

async function cancelReminderOsNotifications(reminderId: number): Promise<void> {
  const rows = await db
    .select()
    .from(reminderNotifications)
    .where(eq(reminderNotifications.reminderId, reminderId));
  await Promise.all(
    rows.map((row) =>
      Notifications.cancelScheduledNotificationAsync(row.osNotificationId).catch(() => {}),
    ),
  );
  await db
    .delete(reminderNotifications)
    .where(eq(reminderNotifications.reminderId, reminderId));
}

// ── ネイティブトリガー登録 ───────────────────────────

async function scheduleNative(r: ParsedReminder): Promise<void> {
  const now = Date.now();
  const ids: string[] = [];

  const data: ReminderNotificationData = {
    type: REMINDER_NOTIFICATION_TYPE,
    reminderId: r.id,
  };
  const content = {
    title: r.title,
    body: r.body,
    sound: true as const,
    data,
    ...(REMINDER_CHANNEL_ID ? { channelId: REMINDER_CHANNEL_ID } : {}),
  };

  if (r.kind === 'interval') {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.hour,
        minute: r.minute,
      },
    });
    ids.push(id);
  } else if (r.kind === 'weekly' && r.weekdays?.length) {
    for (const wd of r.weekdays) {
      // expo weekday: 1=日〜7=土 (JS getDay: 0=日〜6=土)
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: wd + 1,
          hour: r.hour,
          minute: r.minute,
        },
      });
      ids.push(id);
    }
  } else if (r.kind === 'monthly' && r.monthdays?.length) {
    for (const day of r.monthdays) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day,
          hour: r.hour,
          minute: r.minute,
        },
      });
      ids.push(id);
    }
  }

  if (ids.length > 0) {
    await db.insert(reminderNotifications).values(
      ids.map((osId) => ({
        reminderId: r.id,
        osNotificationId: osId,
        triggerType: 'native' as const,
        fireAt: null,
        createdAt: now,
      })),
    );
  }
}

// ── キュー登録 ───────────────────────────────────────

async function scheduleQueue(r: ParsedReminder, depth: number): Promise<void> {
  const now = new Date();
  // 既存キューの最後の fireAt を起点に継ぎ足す
  const existing = await db
    .select()
    .from(reminderNotifications)
    .where(
      and(
        eq(reminderNotifications.reminderId, r.id),
        gt(reminderNotifications.fireAt, now.getTime()),
      ),
    );

  const futureCount = existing.length;
  const need = depth - futureCount;
  if (need <= 0) return;

  const lastFireAt =
    existing.length > 0
      ? Math.max(...existing.map((e) => e.fireAt ?? 0))
      : now.getTime();
  const from = new Date(lastFireAt);

  let dates: Date[] = [];
  if (r.kind === 'interval' && r.intervalDays && r.intervalDays > 1 && r.anchorDate) {
    dates = computeIntervalFireDates(from, r.anchorDate, r.intervalDays, r.hour, r.minute, need);
  } else if (r.kind === 'weekly' && r.weekdays?.length && r.anchorDate) {
    const iw = Math.max(1, Math.round((r.intervalDays ?? 14) / 7));
    const allDates: Date[] = [];
    for (const wd of r.weekdays) {
      allDates.push(
        ...computeBiweeklyFireDates(from, r.anchorDate, wd, r.hour, r.minute, need, iw),
      );
    }
    dates = allDates.sort((a, b) => a.getTime() - b.getTime()).slice(0, need);
  } else if (r.kind === 'monthly') {
    const intervalMonths = r.intervalMonths ?? 1;
    if (r.nthWeek != null) {
      // nthモードなのに曜日未選択の場合は他のmonthdaysロジックにフォールスルーさせない
      // (getNextFireDateの分岐と同じ形に揃えている)
      if (r.nthWeekdays?.length) {
        dates = computeNthWeekdayFireDates(
          from, r.nthWeek, r.nthWeekdays, r.hour, r.minute, need, intervalMonths, r.anchorDate ?? undefined,
        );
      }
    } else if (r.monthdays?.length) {
      if (intervalMonths === 1) {
        dates = computeMonthlyQueueFireDates(from, r.monthdays, r.hour, r.minute, need);
      } else if (r.anchorDate) {
        dates = computeMonthIntervalFireDates(
          from, r.anchorDate, intervalMonths, r.monthdays, r.hour, r.minute, need,
        );
      }
    }
  } else if (r.kind === 'yearly' && r.anchorDate && r.monthdays?.length) {
    const a = new Date(r.anchorDate);
    dates = computeYearlyFireDates(from, a.getMonth(), r.monthdays, r.hour, r.minute, need);
  }

  const nowMs = Date.now();
  const scheduled: { osId: string; date: Date }[] = [];
  for (const date of dates) {
    const queueData: ReminderNotificationData = {
      type: REMINDER_NOTIFICATION_TYPE,
      reminderId: r.id,
    };
    const osId = await Notifications.scheduleNotificationAsync({
      content: {
        title: r.title,
        body: r.body,
        sound: true,
        data: queueData,
        ...(REMINDER_CHANNEL_ID ? { channelId: REMINDER_CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
    scheduled.push({ osId, date });
  }
  if (scheduled.length > 0) {
    await db.insert(reminderNotifications).values(
      scheduled.map(({ osId, date }) => ({
        reminderId: r.id,
        osNotificationId: osId,
        triggerType: 'queue' as const,
        fireAt: date.getTime(),
        createdAt: nowMs,
      })),
    );
  }
}

async function scheduleReminder(r: ParsedReminder): Promise<void> {
  const tt = resolveTriggerType(r);
  if (tt === 'native') {
    await scheduleNative(r);
  } else {
    await scheduleQueue(r, queueDepthFor(r.kind as ReminderKind));
  }
}

// ── 公開 CRUD ────────────────────────────────────────

export async function createReminder(input: ReminderInput): Promise<number> {
  const normalized = normalizeInput(input);
  const now = Date.now();
  const anchorDate = normalized.anchorDate ?? now;

  const row: NewReminder = {
    title: normalized.title,
    body: normalized.body,
    kind: normalized.kind,
    hour: normalized.hour,
    minute: normalized.minute,
    weekdays: normalized.weekdays ? JSON.stringify(normalized.weekdays) : null,
    monthdays: normalized.monthdays ? JSON.stringify(normalized.monthdays) : null,
    anchorDate,
    intervalDays: normalized.intervalDays ?? null,
    intervalMonths: normalized.intervalMonths ?? null,
    nthWeek: normalized.nthWeek ?? null,
    nthWeekdays: normalized.nthWeekdays ? JSON.stringify(normalized.nthWeekdays) : null,
    enabled: normalized.enabled,
    createdAt: now,
    updatedAt: now,
  };

  const [inserted] = await db.insert(reminders).values(row).returning();
  if (normalized.enabled) {
    const parsed = parseReminder(inserted);
    await scheduleReminder(parsed);
  }
  return inserted.id;
}

export async function updateReminder(
  reminderId: number,
  input: ReminderInput,
): Promise<void> {
  const normalized = normalizeInput(input);
  const now = Date.now();
  const anchorDate = normalized.anchorDate ?? now;

  // 全予約を取消してから設定更新 → 再登録
  await cancelReminderOsNotifications(reminderId);

  await db
    .update(reminders)
    .set({
      title: normalized.title,
      body: normalized.body,
      kind: normalized.kind,
      hour: normalized.hour,
      minute: normalized.minute,
      weekdays: normalized.weekdays ? JSON.stringify(normalized.weekdays) : null,
      monthdays: normalized.monthdays ? JSON.stringify(normalized.monthdays) : null,
      anchorDate,
      intervalDays: normalized.intervalDays ?? null,
      intervalMonths: normalized.intervalMonths ?? null,
      nthWeek: normalized.nthWeek ?? null,
      nthWeekdays: normalized.nthWeekdays ? JSON.stringify(normalized.nthWeekdays) : null,
      enabled: normalized.enabled,
      updatedAt: now,
    })
    .where(eq(reminders.id, reminderId));

  if (normalized.enabled) {
    const [updated] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.id, reminderId));
    if (updated) await scheduleReminder(parseReminder(updated));
  }
}

export async function deleteReminder(reminderId: number): Promise<void> {
  await cancelReminderOsNotifications(reminderId);
  await db.delete(reminders).where(eq(reminders.id, reminderId));
}

export async function setReminderEnabled(
  reminderId: number,
  enabled: boolean,
): Promise<void> {
  await cancelReminderOsNotifications(reminderId);
  await db
    .update(reminders)
    .set({ enabled, updatedAt: Date.now() })
    .where(eq(reminders.id, reminderId));

  if (enabled) {
    const [r] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.id, reminderId));
    if (r) await scheduleReminder(parseReminder(r));
  }
}

export async function sendTestNotification(
  title: string,
  body: string,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      repeats: false,
    },
  });
}

// ── 補充・掃除 ───────────────────────────────────────

export async function pruneExpiredNotifications(now = new Date()): Promise<void> {
  await db
    .delete(reminderNotifications)
    .where(
      and(
        eq(reminderNotifications.triggerType, 'queue'),
        lte(reminderNotifications.fireAt, now.getTime()),
      ),
    );
}

export async function refillReminder(reminderId: number): Promise<void> {
  const [r] = await db
    .select()
    .from(reminders)
    .where(eq(reminders.id, reminderId));
  if (!r || !r.enabled) return;

  const parsed = parseReminder(r);
  const tt = resolveTriggerType(parsed);
  if (tt === 'native') return; // ネイティブは補充不要

  const allEnabled = await db.select().from(reminders).where(eq(reminders.enabled, true));
  const queueCount = allEnabled.filter(
    (rem) => resolveTriggerType(parseReminder(rem)) === 'queue',
  ).length;

  const depth = Math.min(
    queueDepthFor(parsed.kind as ReminderKind),
    computeQuotaPerReminder(Math.max(1, queueCount)),
  );
  await scheduleQueue(parsed, depth);
}

export async function refillAllReminders(now = new Date()): Promise<void> {
  const enabledReminders = await db
    .select()
    .from(reminders)
    .where(eq(reminders.enabled, true));

  const queueReminders = enabledReminders.filter(
    (r) => resolveTriggerType(parseReminder(r)) === 'queue',
  );
  const quota = computeQuotaPerReminder(queueReminders.length);

  for (const r of queueReminders) {
    const futureCount = await db
      .select()
      .from(reminderNotifications)
      .where(
        and(
          eq(reminderNotifications.reminderId, r.id),
          eq(reminderNotifications.triggerType, 'queue'),
          gt(reminderNotifications.fireAt, now.getTime()),
        ),
      );

    if (futureCount.length <= REFILL_THRESHOLD) {
      const parsed = parseReminder(r);
      const depth = Math.min(queueDepthFor(parsed.kind as ReminderKind), quota);
      await scheduleQueue(parsed, depth);
    }
  }
}
