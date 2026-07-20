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
import {
  parseReminder,
  rescheduleReminderFromDb,
  resolveTriggerType,
  scheduleQueueNotification,
} from './scheduler';

// リマインダー由来の予定を特定の1日だけ打ち消す(PR10-6a)。キュー方式(隔週/毎年/N日おき/月末/
// 第N曜日/Nヶ月ごと)のリマインダーは該当日の通知だけを狙い撃ちでキャンセル/復元する(安価・既存の
// まま)。ネイティブ方式(毎日/毎週/単純な毎月)はOSの永続的な繰り返しトリガーの性質上1件だけを
// キャンセルする手段が無いため、未来のスキップが1件でも残っている間は一時的にキュー方式へ
// 切り替える(PR10-6c、lib/notifications/scheduler.tsのresolveEffectiveTriggerType/
// rescheduleReminderFromDbが実体)。切り替え/復帰は「全キャンセル→スキップ記録から再判定→
// 作り直し」の1手順に統一されるため、ここではqueue方式の高速パスとnative方式の全面再構築パスを
// 分けるだけでよい
function dayBounds(dateKey: string): { start: number; end: number } {
  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// 該当日にキュー方式で予約済みのreminderNotifications行を洗い出し、OS通知のキャンセル+DB削除まで
// 行う。cancelNotificationForDate（スキップ時）・rescheduleNotificationForDate
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

// 該当日の通知をキャンセルする。呼び出し時点でスキップ記録(reminderScheduleSkips)は既に
// 保存済みである前提(skipReminderOccurrenceがaddReminderScheduleSkipを先に呼ぶ)
async function cancelNotificationForDate(reminderId: number, skippedDate: string): Promise<boolean> {
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  // リマインダー自体が既に無ければ通知の心配も無い(無害な扱いとしてtrue)
  if (!reminder) return true;

  if (resolveTriggerType(parseReminder(reminder)) === 'queue') {
    await cancelExistingNotificationsForDate(reminderId, skippedDate);
    return true;
  }

  // ネイティブ方式: 該当日だけを個別キャンセルする手段がOS側に無いため、全キャンセル→
  // 一時キュー方式で作り直す(PR10-6c)。この時点でスキップ記録は保存済みなので、
  // rescheduleReminderFromDb→scheduleReminder→resolveEffectiveTriggerTypeがqueueと判定し、
  // scheduleQueueの既存スキップ除外フィルタ(scheduler.ts)が該当日を自動的に除いて予約する
  await rescheduleReminderFromDb(reminderId);
  return true;
}

// 「元に戻す」時、スキップ解除した日が未来であればその1回分の通知を復元する
async function rescheduleNotificationForDate(reminderId: number, skippedDate: string): Promise<void> {
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!reminder || !reminder.enabled) return;

  if (resolveTriggerType(parseReminder(reminder)) === 'queue') {
    const fireDate = parseDateKey(skippedDate);
    fireDate.setHours(reminder.hour, reminder.minute, 0, 0);
    if (fireDate.getTime() <= Date.now()) return;

    // cancelNotificationForDateが途中で失敗し古いreminderNotifications行が残っている場合に
    // 備え、復元前に同日分を必ず一度掃除してから作り直す(@reviewer指摘: 二重登録の防止)
    await cancelExistingNotificationsForDate(reminderId, skippedDate);

    // scheduleQueueの補充ロジック（末尾から前進生成、ギャップの穴埋めはしない）をそのまま使うと
    // この特定の1日をピンポイントで戻すことができないため、この1件だけを直接組み立てる
    // (通知content組み立て・単発DATEトリガー登録自体はscheduler.tsのscheduleQueueNotificationを
    // 共有する、@reviewer指摘対応)
    const osId = await scheduleQueueNotification(reminder, fireDate);
    await db.insert(reminderNotifications).values({
      reminderId,
      osNotificationId: osId,
      triggerType: 'queue',
      fireAt: fireDate.getTime(),
      createdAt: Date.now(),
    });
    return;
  }

  // ネイティブ方式(一時キュー化されていた可能性、PR10-6c): removeReminderScheduleSkipが
  // 既にこの1件のスキップ記録を消した後の状態なので、まだ他の未来日にスキップが残っているかで
  // 「一時キュー継続」か「ネイティブへ復帰」かが変わる。全キャンセル→スキップ記録から再判定
  // させる(rescheduleReminderFromDb)ことで、どちらの場合も一手順で正しく再構築できる
  await rescheduleReminderFromDb(reminderId);
}

export type SkipReminderOccurrenceResult = {
  // 実際に該当日の通知を止められたか。falseは、通知APIの失敗など想定外のエラーが起きた場合のみ
  // (PR10-6c以降、トリガー方式による既知の制約は無くなった)
  notificationSuppressed: boolean;
};

// 選択日パネルの予定カード⋮メニュー「削除」（2026-07-19に「今回だけスキップ」から変更）、
// および「今回だけ差し替え」(schedule-time-picker.tsx)の両方から呼ばれる。関数名・テーブル名が
// 「スキップ」のままなのは、内部的には「その日のこの発火は無かったことにする」マーカーとしての
// 役割が変わっていないため（詳細はapp/(tabs)/calendar.tsxのhandleDeleteReminderOccurrence
// 直上のコメント参照）。スキップ記録の保存と、該当日の通知キャンセルをセットで行う。
// 通知キャンセルが失敗してもスキップ自体は成立させたい(表示が消えることの方が優先)ため、
// 通知側のエラーはcatchして握りつぶす。
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
    const notificationSuppressed = await cancelNotificationForDate(reminderId, skippedDate);
    return { notificationSuppressed };
  } catch (e) {
    console.error('[skip reminder occurrence]', e);
    return { notificationSuppressed: false };
  }
}

// 2026-07-19にユーザー向けの「元に戻す」UI（ゴーストカード）は廃止された。現在は
// app/calendar/schedule-time-picker.tsxの「今回だけ差し替え」フローが、手動予定の追加に
// 失敗した際の内部ロールバック専用として呼ぶのみ（ユーザーが直接起動する導線は無い）。
// スキップ記録の削除と、未来日に限り該当日の通知再登録をセットで行う
export async function unskipReminderOccurrence(reminderId: number, skippedDate: string): Promise<void> {
  await removeReminderScheduleSkip(reminderId, skippedDate);
  try {
    await rescheduleNotificationForDate(reminderId, skippedDate);
  } catch (e) {
    console.error('[unskip reminder occurrence]', e);
  }
}
