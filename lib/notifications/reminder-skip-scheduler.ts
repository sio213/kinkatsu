import { db } from '@/db/client';
import { reminderNotifications, reminders } from '@/db/schema';
import { parseDateKey } from '@/lib/calendar/date-grid';
import {
  addReminderScheduleSkip,
  hasReminderScheduleSkip,
  removeReminderScheduleSkip,
} from '@/lib/calendar/reminder-skips';
import { and, eq, gte, lt } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { parseReminder, resolveTriggerType, scheduleQueueNotification } from './scheduler';

// リマインダー由来の予定を特定の1日だけ打ち消す(PR10-6a)。通知面の対応はキュー方式
// (隔週/毎年/N日おき/月末/第N曜日/Nヶ月ごと)のリマインダーに限られる。ネイティブ方式
// (毎日/毎週/単純な毎月)はOSの繰り返しトリガーの性質上1回だけを狙い撃ちでキャンセルする
// 手段が無いため、この段階では表示だけがスキップされ通知自体は従来通り鳴る制約が残る
// (PR10-6cで対応予定、lib/notifications/scheduler.tsのresolveTriggerTypeが示す2方式の分岐と同じ)。
// この既知の制約をユーザーに無言のまま隠さないよう、skipReminderOccurrenceは実際に通知を
// 止められたかどうかを呼び出し元(app/(tabs)/calendar.tsx)へ返し、止められなかった場合は
// 一言伝える設計にしている(自動レビュー指摘: 「スキップ済み」表示なのに通知が鳴ると信頼を損なう)。
// 日境界はhooks/use-calendar-day-schedule.tsと同じsetDate(+1)方式で組み立てる(DSTのある地域へ
// 展開した際に固定86400000だと日またぎがずれる可能性があるため、@reviewer指摘対応)
function dayBounds(dateKey: string): { start: number; end: number } {
  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// 該当日にキュー方式で予約済みのreminderNotifications行を洗い出し、OS通知のキャンセル+DB削除まで
// 行う。cancelQueueNotificationForDate（スキップ時）・rescheduleQueueNotificationForDate
// （元に戻す時、復元前の掃除として）の両方から呼ぶ共通処理（自動レビュー指摘: 前者が途中失敗して
// 行が残ったまま後者がチェック無しでinsertすると、同日に通知が二重登録されてしまう問題への対応）
async function cancelExistingNotificationsForDate(reminderId: number, skippedDate: string): Promise<void> {
  const { start, end } = dayBounds(skippedDate);
  const condition = and(
    eq(reminderNotifications.reminderId, reminderId),
    gte(reminderNotifications.fireAt, start),
    lt(reminderNotifications.fireAt, end),
  );
  const rows = await db.select().from(reminderNotifications).where(condition);
  if (rows.length === 0) return;

  await Promise.all(
    rows.map((row) => Notifications.cancelScheduledNotificationAsync(row.osNotificationId).catch(() => {})),
  );
  await db.delete(reminderNotifications).where(condition);
}

// キュー方式なら該当日の通知をキャンセルする。戻り値は「通知を止められたか」——ネイティブ方式や
// リマインダー不在(削除済み)の場合はfalseになり、呼び出し元でユーザーへの案内に使う
async function cancelQueueNotificationForDate(reminderId: number, skippedDate: string): Promise<boolean> {
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  // リマインダー自体が既に無ければ通知の心配も無い(無害な扱いとしてtrue)
  if (!reminder) return true;
  if (resolveTriggerType(parseReminder(reminder)) !== 'queue') return false;

  await cancelExistingNotificationsForDate(reminderId, skippedDate);
  return true;
}

// 「元に戻す」時、スキップ解除した日が未来であればその1回分の通知を単発DATEトリガーで
// 復元する。scheduleQueueの補充ロジック（末尾から前進生成、ギャップの穴埋めはしない）を
// そのまま使うと、この特定の1日をピンポイントで戻すことができないため、
// lib/notifications/scheduled-workout-scheduler.tsのcreateScheduledWorkoutと同じ発想で
// この1件だけを直接組み立てる(通知content組み立て・単発DATEトリガー登録自体はscheduler.tsの
// scheduleQueueNotificationを共有する、@reviewer指摘対応)
async function rescheduleQueueNotificationForDate(reminderId: number, skippedDate: string): Promise<void> {
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!reminder || !reminder.enabled) return;
  if (resolveTriggerType(parseReminder(reminder)) !== 'queue') return;

  const fireDate = parseDateKey(skippedDate);
  fireDate.setHours(reminder.hour, reminder.minute, 0, 0);
  if (fireDate.getTime() <= Date.now()) return;

  // cancelQueueNotificationForDateが途中で失敗し古いreminderNotifications行が残っている場合に
  // 備え、復元前に同日分を必ず一度掃除してから作り直す(@reviewer指摘: 二重登録の防止)
  await cancelExistingNotificationsForDate(reminderId, skippedDate);

  const osId = await scheduleQueueNotification(reminder, fireDate);
  await db.insert(reminderNotifications).values({
    reminderId,
    osNotificationId: osId,
    triggerType: 'queue',
    fireAt: fireDate.getTime(),
    createdAt: Date.now(),
  });
}

export type SkipReminderOccurrenceResult = {
  // 実際に該当日の通知を止められたか(=キュー方式だったか)。falseの場合、呼び出し元は
  // 「表示は消えたが通知は届く可能性がある」ことをユーザーに伝える必要がある
  notificationSuppressed: boolean;
};

// 選択日パネルの予定カード⋮メニュー「今回だけスキップ」用。スキップ記録の保存と、
// (キュー方式に限り)該当日の通知キャンセルをセットで行う。通知キャンセルが失敗しても
// スキップ自体は成立させたい(表示が消えることの方が優先)ため、通知側のエラーはcatchして握りつぶす。
// 既にスキップ済みの日への二重呼び出し(⋮メニュー連打・useLiveQuery再購読前の再タップ等)は
// unique制約違反による分かりにくいエラーAlertを避けるため、先に存在チェックして冪等にする
// (@reviewer/@tester指摘対応)。存在チェックとinsertの間はTOCTOUで理論上すり抜けうるため、
// 制約違反自体もフォールバックとして個別に握りつぶす(@reviewer指摘)
export async function skipReminderOccurrence(
  reminderId: number,
  skippedDate: string,
): Promise<SkipReminderOccurrenceResult> {
  if (await hasReminderScheduleSkip(reminderId, skippedDate)) return { notificationSuppressed: true };
  try {
    await addReminderScheduleSkip(reminderId, skippedDate);
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return { notificationSuppressed: true };
    }
    throw e;
  }
  try {
    const notificationSuppressed = await cancelQueueNotificationForDate(reminderId, skippedDate);
    return { notificationSuppressed };
  } catch (e) {
    console.error('[skip reminder occurrence]', e);
    return { notificationSuppressed: false };
  }
}

// スキップ済みカードの「元に戻す」用。スキップ記録の削除と、(キュー方式かつ未来日に限り)
// 該当日の通知再登録をセットで行う
export async function unskipReminderOccurrence(reminderId: number, skippedDate: string): Promise<void> {
  await removeReminderScheduleSkip(reminderId, skippedDate);
  try {
    await rescheduleQueueNotificationForDate(reminderId, skippedDate);
  } catch (e) {
    console.error('[unskip reminder occurrence]', e);
  }
}
