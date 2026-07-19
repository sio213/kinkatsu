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
// 日境界はhooks/use-calendar-day-schedule.tsと同じsetDate(+1)方式で組み立てる(DSTのある地域へ
// 展開した際に固定86400000だと日またぎがずれる可能性があるため、@reviewer指摘対応)
function dayBounds(dateKey: string): { start: number; end: number } {
  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

async function cancelQueueNotificationForDate(reminderId: number, skippedDate: string): Promise<void> {
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!reminder || resolveTriggerType(parseReminder(reminder)) !== 'queue') return;

  const { start, end } = dayBounds(skippedDate);
  // select/deleteで同じ絞り込み条件を使い回す(@reviewer指摘: 条件変更時の修正漏れ防止)
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

  const osId = await scheduleQueueNotification(reminder, fireDate);
  await db.insert(reminderNotifications).values({
    reminderId,
    osNotificationId: osId,
    triggerType: 'queue',
    fireAt: fireDate.getTime(),
    createdAt: Date.now(),
  });
}

// 選択日パネルの予定カード⋮メニュー「今回だけスキップ」用。スキップ記録の保存と、
// (キュー方式に限り)該当日の通知キャンセルをセットで行う。通知キャンセルが失敗しても
// スキップ自体は成立させたい(表示が消えることの方が優先)ため、通知側のエラーはcatchして握りつぶす。
// 既にスキップ済みの日への二重呼び出し(⋮メニュー連打・useLiveQuery再購読前の再タップ等)は
// unique制約違反による分かりにくいエラーAlertを避けるため、先に存在チェックして冪等にする
// (@reviewer/@tester指摘対応)
export async function skipReminderOccurrence(reminderId: number, skippedDate: string): Promise<void> {
  if (await hasReminderScheduleSkip(reminderId, skippedDate)) return;
  await addReminderScheduleSkip(reminderId, skippedDate);
  try {
    await cancelQueueNotificationForDate(reminderId, skippedDate);
  } catch (e) {
    console.error('[skip reminder occurrence]', e);
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
