import { db } from '@/db/client';
import { reminders } from '@/db/schema';
import { getActiveSession, startWorkoutFromRoutine } from '@/lib/workout/session';
import { eq } from 'drizzle-orm';
import type { NotificationResponse } from 'expo-notifications';
import { REMINDER_NOTIFICATION_TYPE, type ReminderNotificationData } from './types';

function parseReminderNotificationData(
  response: NotificationResponse | null | undefined,
): ReminderNotificationData | null {
  const data = response?.notification.request.content.data;
  return data?.type === REMINDER_NOTIFICATION_TYPE && typeof data.reminderId === 'number'
    ? (data as ReminderNotificationData)
    : null;
}

export type ReminderTapDestination = '/' | `/workout/${number}`;

// 通知タップのレスポンスから遷移先を判定する。ルーティン由来のリマインダー(reminders.routineIdが
// 設定されている)は、ルーティンの種目・目標セット入りでワークアウトをその場で開始し、その画面へ
// 遷移させる(ルーティン一覧のカードタップと同じ導線)。単体リマインダーは従来通り記録タブへ。
// 判定・セッション作成にDBの参照が要るため非同期
export async function resolveReminderTapDestination(
  response: NotificationResponse | null | undefined,
): Promise<ReminderTapDestination | null> {
  const data = parseReminderNotificationData(response);
  if (!data) return null;

  const [reminder] = await db
    .select({ routineId: reminders.routineId })
    .from(reminders)
    .where(eq(reminders.id, data.reminderId));

  if (reminder?.routineId == null) return '/';

  // 既にトレーニングが進行中の場合は、新規セッションを作らずその画面をそのまま開く(ユーザー要望:
  // 「トレーニング途中なら何も追加せずトレーニング画面を開く」)。ルーティン一覧のカードタップでは
  // 「タップしたルーティンと違う進行中セッションが無言で開く違和感」を確認Alertで解消したが、
  // 通知タップは特定のルーティンを選んで押す操作ではなく受動的なきっかけに過ぎないため、
  // 「今どのトレーニングが進行中でも、それを続けさせる」ことの方が親切と判断した
  const activeSession = await getActiveSession();
  if (activeSession) return `/workout/${activeSession.id}`;

  // startWorkoutFromRoutineはDB書き込みを伴うが、この関数自体はエラーをcatchせず素通しする
  // (呼び出し元のapp/_layout.tsxがconsole.errorのみで受け止め、Alertは出さない)。通知タップは
  // コールドスタート含めUIの文脈を持たないため、書き込み失敗時もユーザーには通知せず元の画面の
  // ままにする、プロジェクトの「DB書き込みは必ずAlert」規約に対する意図的な例外
  const result = await startWorkoutFromRoutine(reminder.routineId);
  return result ? `/workout/${result.sessionId}` : '/';
}
