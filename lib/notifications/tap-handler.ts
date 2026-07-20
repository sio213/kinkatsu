import { db } from '@/db/client';
import { reminders } from '@/db/schema';
import { getActiveSession, startWorkoutFromRoutine, startWorkoutFromScheduledWorkout } from '@/lib/workout/session';
import { eq } from 'drizzle-orm';
import type { NotificationResponse } from 'expo-notifications';
import {
  REMINDER_NOTIFICATION_TYPE,
  SCHEDULED_WORKOUT_DIRECT_NOTIFICATION_TYPE,
  SCHEDULED_WORKOUT_NOTIFICATION_TYPE,
  type ReminderNotificationData,
  type ScheduledWorkoutDirectNotificationData,
  type ScheduledWorkoutNotificationData,
} from './types';

export type ReminderTapDestination = '/' | `/workout/${number}`;

// ルーティンに紐づく通知(リマインダー・手動予定どちらも)共通の遷移判定。既にトレーニングが
// 進行中の場合は、新規セッションを作らずその画面をそのまま開く(ユーザー要望:「トレーニング
// 途中なら何も追加せずトレーニング画面を開く」)。ルーティン一覧のカードタップでは「タップした
// ルーティンと違う進行中セッションが無言で開く違和感」を確認Alertで解消したが、通知タップは
// 特定のルーティンを選んで押す操作ではなく受動的なきっかけに過ぎないため、「今どのトレーニングが
// 進行中でも、それを続けさせる」ことの方が親切と判断した
async function resolveRoutineTapDestination(routineId: number): Promise<ReminderTapDestination> {
  const activeSession = await getActiveSession();
  if (activeSession) return `/workout/${activeSession.id}`;

  // startWorkoutFromRoutineはDB書き込みを伴うが、この関数自体はエラーをcatchせず素通しする
  // (呼び出し元のapp/_layout.tsxがconsole.errorのみで受け止め、Alertは出さない)。通知タップは
  // コールドスタート含めUIの文脈を持たないため、書き込み失敗時もユーザーには通知せず元の画面の
  // ままにする、プロジェクトの「DB書き込みは必ずAlert」規約に対する意図的な例外
  const result = await startWorkoutFromRoutine(routineId);
  return result ? `/workout/${result.sessionId}` : '/';
}

// 「直接追加」予定（scheduledWorkoutExercises、ルーティンを介さず個別に選んだ種目、2026-07-20）の
// 通知タップ用。resolveRoutineTapDestinationと同じく進行中セッションがあればそちらへ合流し、
// 無ければその予定の種目でセッションを新規開始する
async function resolveDirectScheduleTapDestination(scheduledWorkoutId: number): Promise<ReminderTapDestination> {
  const activeSession = await getActiveSession();
  if (activeSession) return `/workout/${activeSession.id}`;

  const result = await startWorkoutFromScheduledWorkout(scheduledWorkoutId);
  return result ? `/workout/${result.sessionId}` : '/';
}

// 通知タップのレスポンスから遷移先を判定する。判定・セッション作成にDBの参照が要るため非同期
export async function resolveReminderTapDestination(
  response: NotificationResponse | null | undefined,
): Promise<ReminderTapDestination | null> {
  const data = response?.notification.request.content.data;

  // ルーティン由来のリマインダー(reminders.routineIdが設定されている)は、ルーティンの種目・
  // 目標セット入りでワークアウトをその場で開始し、その画面へ遷移させる(ルーティン一覧のカード
  // タップと同じ導線)。単体リマインダーは従来通り記録タブへ
  if (data?.type === REMINDER_NOTIFICATION_TYPE && typeof data.reminderId === 'number') {
    const { reminderId } = data as ReminderNotificationData;
    const [reminder] = await db
      .select({ routineId: reminders.routineId })
      .from(reminders)
      .where(eq(reminders.id, reminderId));
    if (reminder?.routineId == null) return '/';
    return resolveRoutineTapDestination(reminder.routineId);
  }

  // カレンダーのルーティン紐付き手動予定(PR10-5)。単発かつroutineIdを持つため、リマインダーと違いDBを
  // 引き直さずdataのroutineIdをそのまま使える（routineIdを持たない直接予定は下のSCHEDULED_WORKOUT_DIRECT分岐）
  if (
    data?.type === SCHEDULED_WORKOUT_NOTIFICATION_TYPE &&
    typeof data.routineId === 'number'
  ) {
    const { routineId } = data as ScheduledWorkoutNotificationData;
    return resolveRoutineTapDestination(routineId);
  }

  // カレンダーの「直接追加」予定（2026-07-20）。種目リストは可変長のためdataには
  // scheduledWorkoutIdのみ積まれており、タップ時にscheduledWorkoutExercisesを引き直す
  if (
    data?.type === SCHEDULED_WORKOUT_DIRECT_NOTIFICATION_TYPE &&
    typeof data.scheduledWorkoutId === 'number'
  ) {
    const { scheduledWorkoutId } = data as ScheduledWorkoutDirectNotificationData;
    return resolveDirectScheduleTapDestination(scheduledWorkoutId);
  }

  return null;
}
