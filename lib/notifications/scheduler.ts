import { db } from '@/db/client';
import {
  reminderNotifications,
  reminderScheduleSkips,
  reminders,
  type NewReminder,
  type Reminder,
} from '@/db/schema';
import { toDateKey } from '@/lib/calendar/date-grid';
import { getReminderIdsWithSkips, hasAnyReminderScheduleSkip } from '@/lib/calendar/reminder-skips';
import { and, eq, gt, lte } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { REMINDER_CHANNEL_ID } from './channels';
// スケジュール計算の純粋関数群はdb/client(expo-sqlite)を持たないschedule-math.tsに
// 切り出してある(Jestで動かせる場所に置くため)。ここから再エクスポートし、既存の
// 呼び出し側(hooks/use-reminders.ts, app/_layout.tsx, __tests__/scheduler/scheduler.test.ts等)は
// 変更不要にする
import {
  computeBiweeklyFireDates,
  computeDailyFireDates,
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
  type TriggerType,
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
  computeDailyFireDates,
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
  } else if (r.kind === 'interval' && (r.intervalDays ?? 1) === 1) {
    // 毎日(ネイティブ方式が基本)を、未来のスキップがある間だけ一時的にキュー方式へ切り替える
    // 際に使う(PR10-6c)。通常のネイティブ方式運用ではこの分岐には来ない
    dates = computeDailyFireDates(from, r.hour, r.minute, need);
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

// 「今回だけスキップ」(PR10-6a)は、ネイティブ方式(毎日/毎週/単純な毎月)のリマインダーだと
// OSの永続的な繰り返しトリガーの性質上1件だけを狙い撃ちでキャンセルできない制約があった。
// PR10-6cではこれを解消するため、ネイティブ方式でも未来のスキップが1件でも残っている間は
// 一時的にキュー方式(個別のDATEトリガーを複数予約する方式)へ切り替え、スキップ日だけ除外して
// 予約する。切り替え状態は専用カラムを持たず、実際に予約されている行(reminderNotifications)と
// スキップ記録(reminderScheduleSkips)から都度導出する——cancelReminderOsNotificationsが
// 再スケジュール前に必ず全行を消すため、1つのリマインダーがnative行とqueue行を混在させることは
// 無く、判定が曖昧になる余地がない(新カラム方式は、マイグレーション追加+全CRUDパスでの
// フラグ同期という故障面が増えるため見送った)
export async function resolveEffectiveTriggerType(r: ParsedReminder): Promise<TriggerType> {
  const base = resolveTriggerType(r);
  if (base === 'queue') return 'queue';
  return (await hasAnyReminderScheduleSkip(r.id)) ? 'queue' : 'native';
}

// updateReminder/setReminderEnabledの「全キャンセル→DB再読込→再スケジュール」と同じ処理を
// 共通化(@reviewer指摘の重複解消と同じ方針)。ネイティブ⇄一時キューの切り替えは、OS側の
// 繰り返しトリガーを個別にキャンセルする手段が無いため、全消し→作り直しが唯一の手段になる
export async function rescheduleReminderFromDb(reminderId: number): Promise<void> {
  await cancelReminderOsNotifications(reminderId);
  const [r] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!r || !r.enabled) return;
  await scheduleReminder(parseReminder(r));
}

// 有効な全リマインダーのうち「実効的にqueue方式」(base=queue、または一時キュー化されているnative)
// かどうかを判定する。resolveQueueDepth/refillReminder/refillAllRemindersが同じ判定を
// 別々に再実装していた重複を解消する(@reviewer Minor指摘)
function isEffectiveQueueReminder(r: Reminder, skipReminderIds: Set<number>): boolean {
  return resolveTriggerType(parseReminder(r)) === 'queue' || skipReminderIds.has(r.id);
}

async function countEffectiveQueueReminders(): Promise<number> {
  const allEnabled = await db.select().from(reminders).where(eq(reminders.enabled, true));
  const skipReminderIds = await getReminderIdsWithSkips();
  return allEnabled.filter((rem) => isEffectiveQueueReminder(rem, skipReminderIds)).length;
}

// queue方式で予約する際のdepthを、OS通知上限(MAX_OS_NOTIFICATIONS)を考慮して決定する。
// 種別ごとの基本depth(queueDepthFor)と、実効的にqueue方式の全リマインダー数で按分した予算
// (computeQuotaPerReminder、refillReminder/refillAllRemindersと同じ計算式)の小さい方を採用する。
// 以前は一時キュー化(スキップ)時のみ固定depthを無条件で積んでおり、他にqueue方式リマインダーが
// 多い状態でスキップを連打すると、OS側の保留通知上限(iOS ~64件)を超えて無関係な他のリマインダーの
// 通知が静かに欠落しうる問題があった(@reviewer Major指摘)。DBクエリ1回分のコストは、iOS通知
// 予算という共有リソースを守る正しさより優先すべきではないため、通常のqueue方式リマインダー
// (createReminder/updateReminder経由)にもこの予算計算を一貫して適用する
async function resolveQueueDepth(r: ParsedReminder): Promise<number> {
  const queueCount = await countEffectiveQueueReminders();
  return Math.min(queueDepthFor(r.kind as ReminderKind), computeQuotaPerReminder(Math.max(1, queueCount)));
}

async function scheduleReminder(r: ParsedReminder): Promise<void> {
  const tt = await resolveEffectiveTriggerType(r);
  if (tt === 'native') {
    await scheduleNative(r);
  } else {
    await scheduleQueue(r, await resolveQueueDepth(r));
  }
}

// アプリ起動時(app/_layout.tsxのonAppStart)に、ネイティブ⇄一時キューの整合を取る。
// - スキップが残っているのにnative行のまま(未変換。PR10-6a/6bの間に書かれた既存データとの
//   後方互換も兼ねる) → キュー化
// - スキップが無いのにqueue行が残っている(スキップ日経過後の取り残し) → ネイティブへ自動リバート
// pruneExpiredReminderScheduleSkipsが先に実行される前提のため、ここで残るスキップは今日以降のみ
export async function reconcileNativeReminderSchedules(): Promise<void> {
  const enabledReminders = await db.select().from(reminders).where(eq(reminders.enabled, true));
  const skipReminderIds = await getReminderIdsWithSkips();
  // getReminderIdsWithSkipsと対称に、queue化済みのreminderId集合も1クエリでまとめて取得する
  // (@reviewer指摘: 従来はループ内でリマインダーごとに1クエリ発行するN+1になっていた)
  const queueRows = await db
    .select({ reminderId: reminderNotifications.reminderId })
    .from(reminderNotifications)
    .where(eq(reminderNotifications.triggerType, 'queue'));
  const queuedReminderIds = new Set(queueRows.map((row) => row.reminderId));

  for (const r of enabledReminders) {
    const parsed = parseReminder(r);
    if (resolveTriggerType(parsed) !== 'native') continue; // base-queueは常にqueueのままなので対象外

    const hasSkip = skipReminderIds.has(r.id);
    const isQueued = queuedReminderIds.has(r.id);

    if (hasSkip !== isQueued) {
      await rescheduleReminderFromDb(r.id);
    }
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
  const tt = await resolveEffectiveTriggerType(parsed);
  if (tt === 'native') return; // ネイティブ(スキップ無し)は補充不要

  // depthの算出(予算按分含む)はscheduleReminderの一時キュー化分岐と同じresolveQueueDepthに
  // 統一する(@reviewer Minor指摘: 同じ判定ロジックが複数箇所に再実装されていた重複の解消)
  await scheduleQueue(parsed, await resolveQueueDepth(parsed));
}

export async function refillAllReminders(now = new Date()): Promise<void> {
  const enabledReminders = await db
    .select()
    .from(reminders)
    .where(eq(reminders.enabled, true));

  // 一時キュー化されているnative(スキップにより effective='queue')も補充サイクルに含める
  // (@reviewer Major指摘想定: 含めないとキューが14日窓を使い切って通知が止まってしまう)。
  // 判定はisEffectiveQueueReminderに共通化(@reviewer Minor指摘)。ここは対象リストと件数を
  // 1回のクエリ結果からまとめて算出できるため、resolveQueueDepth(reminderId単体を再クエリする)
  // ではなくこの場でquotaを計算する
  const skipReminderIds = await getReminderIdsWithSkips();
  const queueReminders = enabledReminders.filter((r) => isEffectiveQueueReminder(r, skipReminderIds));
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
