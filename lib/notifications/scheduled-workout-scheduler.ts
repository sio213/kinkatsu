import { db } from '@/db/client';
import { exercises, routines, scheduledWorkoutExercises, scheduledWorkouts } from '@/db/schema';
import { formatDirectScheduleTitle, groupExerciseNamesByScheduleId } from '@/lib/calendar/schedule';
import { parseDateKey, toDateKey } from '@/lib/calendar/date-grid';
import { addDirectScheduledWorkout, addScheduledWorkout, deleteScheduledWorkout } from '@/lib/calendar/scheduled-workouts';
import { and, eq, gte, inArray } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { REMINDER_CHANNEL_ID } from './channels';
import { DEFAULT_REMINDER_BODY } from './messages';
import { getPermissionState } from './permissions';
import { skipReminderOccurrence, unskipReminderOccurrence } from './reminder-skip-scheduler';
import {
  SCHEDULED_WORKOUT_DIRECT_NOTIFICATION_TYPE,
  SCHEDULED_WORKOUT_NOTIFICATION_TYPE,
  type ScheduledWorkoutDirectNotificationData,
  type ScheduledWorkoutNotificationData,
} from './types';

// カレンダーで手動追加する予定(scheduledWorkouts)への通知(PR10-5)。1レコード=1回のみの
// 通知で、繰り返しリマインダー(lib/notifications/scheduler.ts)のキュー補充・ネイティブ
// トリガー計算は不要。通知IDはscheduledWorkoutIdから決定論的に組み立てる(identifier指定)ため、
// 専用テーブル・マイグレーションを持たずに削除時のキャンセルができる
function notificationIdFor(scheduledWorkoutId: number): string {
  return `scheduled-workout-${scheduledWorkoutId}`;
}

// 通知登録(scheduleNotification)・キャンセル判定(下記)で共有する発火時刻の組み立て
function buildScheduledWorkoutFireDate(scheduledDate: string, hour: number, minute: number): Date {
  const date = parseDateKey(scheduledDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

type ScheduledWorkoutLike = {
  id: number;
  // ルーティン予定はnumber、「直接追加」予定（2026-07-20）はnull
  routineId: number | null;
  scheduledDate: string;
  hour: number;
  minute: number;
  notifyEnabled: boolean;
};

// 権限確認・過去日時判定を済ませた前提で通知を登録する内部関数。権限チェックは呼び出し元の
// 粒度(単発/一括)によってコストが変わるため、ここでは持たない。titleはルーティン名または
// formatDirectScheduleTitleで合成した種目名（呼び出し側が解決して渡す）
async function scheduleNotificationCore(sw: ScheduledWorkoutLike, title: string, fireDate: Date): Promise<void> {
  const data: ScheduledWorkoutNotificationData | ScheduledWorkoutDirectNotificationData =
    sw.routineId != null
      ? { type: SCHEDULED_WORKOUT_NOTIFICATION_TYPE, routineId: sw.routineId }
      : { type: SCHEDULED_WORKOUT_DIRECT_NOTIFICATION_TYPE, scheduledWorkoutId: sw.id };
  await Notifications.scheduleNotificationAsync({
    identifier: notificationIdFor(sw.id),
    content: {
      title,
      body: DEFAULT_REMINDER_BODY,
      sound: true,
      data,
      ...(REMINDER_CHANNEL_ID ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
}

// 権限が無い場合・過去日時の場合・この予定の通知トグルがOFFの場合は無言でスキップする
// (呼び出し画面側でensurePermission()＋PermissionBannerにより案内済みのため、ここで重ねて
// Alertは出さない設計、PR10-5計画フェーズの@designer方針)
async function scheduleNotification(sw: ScheduledWorkoutLike, title: string): Promise<void> {
  if (!sw.notifyEnabled) return;
  const fireDate = buildScheduledWorkoutFireDate(sw.scheduledDate, sw.hour, sw.minute);
  if (fireDate.getTime() <= Date.now()) return;
  if ((await getPermissionState()) !== 'granted') return;
  await scheduleNotificationCore(sw, title, fireDate);
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
  notifyEnabled: boolean,
): Promise<number> {
  const id = await addScheduledWorkout(routineId, scheduledDate, hour, minute, notifyEnabled);
  try {
    await scheduleNotification({ id, routineId, scheduledDate, hour, minute, notifyEnabled }, routineName);
  } catch (e) {
    console.error('[schedule scheduled-workout notification]', e);
  }
  return id;
}

// 選択日パネル「予定を追加」→「直接追加」(app/calendar/schedule-exercise-picker.tsx経由)専用の
// オーケストレータ。createScheduledWorkoutと同じく予定の保存(DB)と通知登録をセットで行い、
// 通知登録の失敗は握りつぶす（予定自体は残す）。titleは呼び出し側(schedule-time-picker.tsx)が
// formatDirectScheduleTitleで合成済みのものを渡す
export async function createDirectScheduledWorkout(
  exerciseIds: number[],
  title: string,
  scheduledDate: string,
  hour: number,
  minute: number,
  notifyEnabled: boolean,
): Promise<number> {
  const id = await addDirectScheduledWorkout(exerciseIds, scheduledDate, hour, minute, notifyEnabled);
  try {
    await scheduleNotification({ id, routineId: null, scheduledDate, hour, minute, notifyEnabled }, title);
  } catch (e) {
    console.error('[schedule direct scheduled-workout notification]', e);
  }
  return id;
}

export type MaterializeReminderOccurrenceResult = {
  scheduledWorkoutId: number;
  // skipReminderOccurrenceの結果をそのまま透過する。falseは通知API側の想定外エラーのみを
  // 意味し（PR10-6cによりトリガー方式の制約ではなくなった）、呼び出し側（app/(tabs)/calendar.tsx）
  // が「新しい通知の登録に失敗した可能性があります」という警告を出せるようにする
  // （@reviewer Major指摘: 破棄すると二重通知が起きても無言になる）
  notificationSuppressed: boolean;
};

// リマインダー由来の予定インスタンス（scheduledWorkouts行を持たず、reminders設定から毎回
// 動的に計算されているだけ）を、種目カードタップ時に初めてscheduledWorkouts実体として書き出す
// （2026-07-21、ルーティン予定を直接予定と同じ種目カード一覧表示・編集に統一する改修）。
// 「skip+create」の合成で、通知の二重登録防止（元のリマインダー発火をスキップしないと、
// 新しいscheduledWorkouts側の通知と重複する）のため、表示側dedupe
// (lib/calendar/schedule.tsのmergeScheduleCards)だけでは代替できずskipが必須。
// 呼び出し側は種目カードタップのたびに呼ばれるため冪等ではない点に注意（skipReminderOccurrence
// 自体は冪等だが、createScheduledWorkoutは冪等でなくscheduledWorkouts行が毎回作られる。
// 二重実体化を防ぐガードは呼び出し側（app/(tabs)/calendar.tsxのタップハンドラ）の責務とする）
export async function materializeReminderOccurrence(
  reminderId: number,
  routineId: number,
  routineName: string,
  scheduledDate: string,
  hour: number,
  minute: number,
): Promise<MaterializeReminderOccurrenceResult> {
  const { notificationSuppressed } = await skipReminderOccurrence(reminderId, scheduledDate);
  try {
    // リマインダー由来の実体化は常に通知ONだった元の予定を引き継ぐため、notifyEnabledは固定true
    // （このフローに通知トグルUIは無く、常にリマインダーの通知設定を尊重する）
    const scheduledWorkoutId = await createScheduledWorkout(routineId, routineName, scheduledDate, hour, minute, true);
    return { scheduledWorkoutId, notificationSuppressed };
  } catch (e) {
    // 前半のskipだけ成立して元の予定が無言で消えたままになるのを防ぐロールバック
    // （@reviewer Major指摘の再発防止）
    try {
      await unskipReminderOccurrence(reminderId, scheduledDate);
    } catch (rollbackError) {
      console.error('[rollback skip after materialize failure]', rollbackError);
    }
    throw e;
  }
}

// 目標セット編集画面のヘッダー⋮「削除」(app/calendar/schedule-workout-edit.tsxのhandleDeleteWorkout、
// 2026-07-22より実体化済み予定=直接予定・手動ルーティン予定の削除操作はこの画面に一本化された)用。
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
  // notifyEnabled=falseの予定を含めてしまうと、この関数が対象を無条件に再スケジュールする
  // 性質上、OFFにしたはずの予定がアプリ再起動のたびに通知復活してしまう(@planner指摘の最重要リスク)
  const rows = await db
    .select()
    .from(scheduledWorkouts)
    .where(and(gte(scheduledWorkouts.scheduledDate, toDateKey(new Date())), eq(scheduledWorkouts.notifyEnabled, true)));
  if (rows.length === 0) return;
  // 権限チェックはネイティブ呼び出しのため、行ごとではなくここで1回だけ行う
  if ((await getPermissionState()) !== 'granted') return;

  const routineRows = await db.select({ id: routines.id, name: routines.name }).from(routines);
  const routineNameById = new Map(routineRows.map((r) => [r.id, r.name] as const));

  // 「直接追加」予定（routineIdがnull）の種目名をscheduledWorkoutId単位でまとめて取得する
  // （行ごとに問い合わせると対象日以降の予定数だけクエリが増えるため、useRoutineExerciseSummaries等と
  // 同じくバッチで1クエリにまとめる）
  const directScheduleIds = rows.filter((sw) => sw.routineId == null).map((sw) => sw.id);
  const directTitleById = new Map<number, string>();
  if (directScheduleIds.length > 0) {
    const exerciseRows = await db
      .select({
        scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
        exerciseName: exercises.name,
        orderIndex: scheduledWorkoutExercises.orderIndex,
      })
      .from(scheduledWorkoutExercises)
      .innerJoin(exercises, eq(scheduledWorkoutExercises.exerciseId, exercises.id))
      .where(inArray(scheduledWorkoutExercises.scheduledWorkoutId, directScheduleIds))
      .orderBy(scheduledWorkoutExercises.orderIndex);
    const namesById = groupExerciseNamesByScheduleId(
      exerciseRows.map((row) => ({ scheduledWorkoutId: row.scheduledWorkoutId, name: row.exerciseName })),
    );
    for (const [scheduledWorkoutId, names] of namesById) {
      directTitleById.set(scheduledWorkoutId, formatDirectScheduleTitle(names));
    }
  }

  const now = Date.now();
  await Promise.all(
    rows.map(async (sw) => {
      const title = sw.routineId != null ? routineNameById.get(sw.routineId) : directTitleById.get(sw.id);
      if (title === undefined) return;
      const fireDate = buildScheduledWorkoutFireDate(sw.scheduledDate, sw.hour, sw.minute);
      if (fireDate.getTime() <= now) return;
      try {
        await scheduleNotificationCore(sw, title, fireDate);
      } catch (e) {
        console.error('[sync scheduled-workout notification]', e);
      }
    }),
  );
}
