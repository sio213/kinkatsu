import { db } from '@/db/client';
import { routines, scheduledWorkouts } from '@/db/schema';
import { parseDateKey, toDateKey } from '@/lib/calendar/date-grid';
import { addScheduledWorkout, deleteScheduledWorkout } from '@/lib/calendar/scheduled-workouts';
import { eq, gte } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { REMINDER_CHANNEL_ID } from './channels';
import { DEFAULT_REMINDER_BODY } from './messages';
import { getPermissionState } from './permissions';
import { SCHEDULED_WORKOUT_NOTIFICATION_TYPE, type ScheduledWorkoutNotificationData } from './types';

// カレンダーで手動追加する予定(scheduledWorkouts)への通知(PR10-5)。1レコード=1回のみの
// 通知で、繰り返しリマインダー(lib/notifications/scheduler.ts)のキュー補充・ネイティブ
// トリガー計算は不要。通知IDはscheduledWorkoutIdから決定論的に組み立てる(identifier指定)ため、
// 専用テーブル・マイグレーションを持たずに削除時のキャンセルができる
function notificationIdFor(scheduledWorkoutId: number): string {
  return `scheduled-workout-${scheduledWorkoutId}`;
}

// app/calendar/schedule-time-picker.tsxの「今日の過ぎた時刻」判定でも同じ計算が必要なため、
// UI層とのロジック重複を避けてここから公開する
export function buildScheduledWorkoutFireDate(scheduledDate: string, hour: number, minute: number): Date {
  const date = parseDateKey(scheduledDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

type ScheduledWorkoutLike = {
  id: number;
  routineId: number;
  scheduledDate: string;
  hour: number;
  minute: number;
};

// 権限確認・過去日時判定を済ませた前提で通知を登録する内部関数。権限チェックは呼び出し元の
// 粒度(単発/一括)によってコストが変わるため、ここでは持たない
async function scheduleNotificationCore(sw: ScheduledWorkoutLike, routineName: string, fireDate: Date): Promise<void> {
  const data: ScheduledWorkoutNotificationData = {
    type: SCHEDULED_WORKOUT_NOTIFICATION_TYPE,
    routineId: sw.routineId,
  };
  await Notifications.scheduleNotificationAsync({
    identifier: notificationIdFor(sw.id),
    content: {
      title: routineName,
      body: DEFAULT_REMINDER_BODY,
      sound: true,
      data,
      ...(REMINDER_CHANNEL_ID ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
}

// 権限が無い場合・過去日時の場合は無言でスキップする(呼び出し画面側でensurePermission()＋
// PermissionBannerにより案内済みのため、ここで重ねてAlertは出さない設計、PR10-5計画フェーズの
// @designer方針)
async function scheduleNotification(sw: ScheduledWorkoutLike, routineName: string): Promise<void> {
  const fireDate = buildScheduledWorkoutFireDate(sw.scheduledDate, sw.hour, sw.minute);
  if (fireDate.getTime() <= Date.now()) return;
  if ((await getPermissionState()) !== 'granted') return;
  await scheduleNotificationCore(sw, routineName, fireDate);
}

async function cancelNotification(scheduledWorkoutId: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationIdFor(scheduledWorkoutId)).catch(() => {});
}

// 選択日パネル「予定を追加」(app/calendar/schedule-time-picker.tsx)専用のオーケストレータ。
// 予定の保存(DB)と通知登録をセットで行う。通知登録が失敗しても予定作成自体は成功させたい
// (通知が無くてもカレンダーに予定が残る方がユーザーにとって良い)ため、通知側のエラーは
// catchして握りつぶす
export async function createScheduledWorkout(
  routineId: number,
  routineName: string,
  scheduledDate: string,
  hour: number,
  minute: number,
): Promise<number> {
  const id = await addScheduledWorkout(routineId, scheduledDate, hour, minute);
  try {
    await scheduleNotification({ id, routineId, scheduledDate, hour, minute }, routineName);
  } catch (e) {
    console.error('[schedule scheduled-workout notification]', e);
  }
  return id;
}

// 選択日パネル手動予定カードの⋮メニュー「削除」(app/(tabs)/calendar.tsxのhandleDeleteSchedule)用。
// 通知キャンセルを先に行ってからDB削除する。cancelNotificationは内部でエラーを握りつぶし常に
// 成功するため、この順序なら万一DB削除が失敗しても通知だけは確実に止められる
export async function removeScheduledWorkout(scheduledWorkoutId: number): Promise<void> {
  await cancelNotification(scheduledWorkoutId);
  await deleteScheduledWorkout(scheduledWorkoutId);
}

// ルーティン削除(lib/routines/db.tsのdeleteRoutine)専用。scheduledWorkouts.routineIdはON DELETE
// CASCADEのため、ルーティン削除時にDB行自体はSQLite側で自動的に消える。しかしそれだけでは
// OS側の保留通知(scheduled-workout-{id})はキャンセルされず残留してしまう(remindersに対して
// deleteRoutineが明示的にdeleteReminder()を経由しているのと同じ理由)。DB行の削除は既存の
// カスケードに任せるため、ここではOS通知のキャンセルだけを行いDBには触れない
export async function cancelScheduledWorkoutNotificationsForRoutine(routineId: number): Promise<void> {
  const rows = await db
    .select({ id: scheduledWorkouts.id })
    .from(scheduledWorkouts)
    .where(eq(scheduledWorkouts.routineId, routineId));
  await Promise.all(rows.map((r) => cancelNotification(r.id)));
}

// アプリ起動時(app/_layout.tsxのonAppStart)、通知権限が許可されている場合のみ呼ぶ。OS再起動や
// アプリ再インストールで保留通知が消えた場合、権限を後から許可した場合、ルーティン名を変更した
// 場合(同一identifierで置換されるためタイトルのstaleも解消される)等に未来の手動予定を
// 再スケジュールして追従する。scheduleNotificationAsyncは同一identifierを渡すと置換されるため
// 冪等に呼んで問題ない
export async function syncScheduledWorkoutNotifications(): Promise<void> {
  // 手動予定は削除されない限り蓄積されるため、全件取得だと長期利用でクエリ・ループコストが
  // 増加し続ける(自動レビュー指摘)。scheduledDateはtoDateKeyと同じ'YYYY-MM-DD'形式で
  // 文字列比較が日付順と一致するため、SQL側で当日以降だけに絞り込む(時刻(hour/minute)まではSQLで
  // 絞れないため、当日中の過ぎた時刻は従来通りJS側のfireDate判定で除外する)
  const rows = await db
    .select()
    .from(scheduledWorkouts)
    .where(gte(scheduledWorkouts.scheduledDate, toDateKey(new Date())));
  if (rows.length === 0) return;
  // 権限チェックはネイティブ呼び出しのため、行ごとではなくここで1回だけ行う
  if ((await getPermissionState()) !== 'granted') return;

  const routineRows = await db.select({ id: routines.id, name: routines.name }).from(routines);
  const routineNameById = new Map(routineRows.map((r) => [r.id, r.name] as const));

  const now = Date.now();
  await Promise.all(
    rows.map(async (sw) => {
      const routineName = routineNameById.get(sw.routineId);
      if (routineName === undefined) return;
      const fireDate = buildScheduledWorkoutFireDate(sw.scheduledDate, sw.hour, sw.minute);
      if (fireDate.getTime() <= now) return;
      try {
        await scheduleNotificationCore(sw, routineName, fireDate);
      } catch (e) {
        console.error('[sync scheduled-workout notification]', e);
      }
    }),
  );
}
