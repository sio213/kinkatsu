import { db } from '@/db/client';
import {
  reminderNotifications,
  reminderScheduleSkips,
  reminders,
  type NewReminder,
  type Reminder,
} from '@/db/schema';
import { toDateKey } from '@/lib/calendar/date-grid';
import { and, eq, gt, lte } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { REMINDER_CHANNEL_ID } from './channels';
// スケジュール計算の純粋関数群はdb/client(expo-sqlite)を持たないschedule-math.tsに
// 切り出してある(Jestで動かせる場所に置くため)。ここから再エクスポートし、既存の
// 呼び出し側(hooks/use-reminders.ts, app/_layout.tsx, __tests__/scheduler/scheduler.test.ts等)は
// 変更不要にする
import {
  computeBiweeklyFireDates,
  computeIntervalFireDates,
  computeMonthIntervalFireDates,
  computeMonthlyQueueFireDates,
  computeNthWeekdayFireDates,
  computeQuotaPerReminder,
  computeYearlyFireDates,
  normalizeInput,
  queueDepthFor,
  REFILL_THRESHOLD,
  resolveTriggerType,
} from './schedule-math';
import {
  REMINDER_NOTIFICATION_TYPE,
  type ParsedReminder,
  type ReminderInput,
  type ReminderKind,
  type ReminderNotificationData,
} from './types';

export {
  computeBiweeklyFireDates,
  computeIntervalFireDates,
  computeMonthIntervalFireDates,
  computeMonthlyQueueFireDates,
  computeNthWeekdayFireDates,
  computeQuotaPerReminder,
  computeYearlyFireDates,
  getFireDatesInRange,
  getNextFireDate,
  MAX_OS_NOTIFICATIONS,
  nextDailyFireDate,
  nextWeeklyFireDate,
  normalizeInput,
  QUEUE_DEPTH_BIWEEKLY,
  QUEUE_DEPTH_INTERVAL,
  QUEUE_DEPTH_MONTHLY_EOM,
  QUEUE_DEPTH_YEARLY,
  queueDepthFor,
  REFILL_THRESHOLD,
  resolveMonthDay,
  resolveNthWeekdayDay,
  resolveTriggerType,
  type TriggerType,
} from './schedule-math';

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

// 通知content(title/body/sound/data/channelId)の組み立て。scheduleNative・scheduleQueue・
// reminder-skip-scheduler.tsのunskip時の単発復元(PR10-6a)で同じ形が必要になるため共通化する
// (@reviewer指摘: 3箇所に複製されていた)
function buildReminderNotificationContent(r: { id: number; title: string; body: string }) {
  const data: ReminderNotificationData = {
    type: REMINDER_NOTIFICATION_TYPE,
    reminderId: r.id,
  };
  return {
    title: r.title,
    body: r.body,
    sound: true as const,
    data,
    ...(REMINDER_CHANNEL_ID ? { channelId: REMINDER_CHANNEL_ID } : {}),
  };
}

// キュー方式の単発DATEトリガー通知を1件登録する。scheduleQueueのループと、reminder-skip-scheduler.ts
// のunskipReminderOccurrence（スキップ解除時に該当1件だけを復元する、@reviewer指摘対応）の両方から
// 使う。DB挿入(reminderNotifications)は呼び出し側でバッチ方式が異なる(scheduleQueueは複数件まとめて
// insert、unskip側は1件のみ即insert)ためここでは行わず、osNotificationIdの取得までに留める
export async function scheduleQueueNotification(
  reminder: { id: number; title: string; body: string },
  date: Date,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: buildReminderNotificationContent(reminder),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

// ── ネイティブトリガー登録 ───────────────────────────

async function scheduleNative(r: ParsedReminder): Promise<void> {
  const now = Date.now();
  const ids: string[] = [];

  const content = buildReminderNotificationContent(r);

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

  // 特定日だけの打ち消し(PR10-6a)を、新規に生成する未来分にも反映する。ここで除外しないと、
  // 補充(refillReminder等)のたびにスキップした日が復活して通知が鳴ってしまう。除外した分
  // depthに届かなくても実害は無く、次回の補充サイクルで末尾に継ぎ足される(既存のthreshold
  // ベースの補充ロジックが前提にしている許容範囲と同じ)
  if (dates.length > 0) {
    const skipRows = await db
      .select({ skippedDate: reminderScheduleSkips.skippedDate })
      .from(reminderScheduleSkips)
      .where(eq(reminderScheduleSkips.reminderId, r.id));
    if (skipRows.length > 0) {
      const skipSet = new Set(skipRows.map((s) => s.skippedDate));
      dates = dates.filter((d) => !skipSet.has(toDateKey(d)));
    }
  }

  const nowMs = Date.now();
  const scheduled: { osId: string; date: Date }[] = [];
  for (const date of dates) {
    const osId = await scheduleQueueNotification(r, date);
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
    routineId: normalized.routineId ?? null,
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
      routineId: normalized.routineId ?? null,
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
