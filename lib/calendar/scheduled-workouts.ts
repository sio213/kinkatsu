import { db } from '@/db/client';
import { scheduledWorkoutExercises, scheduledWorkouts } from '@/db/schema';
import {
  addHistoryCardsToScheduledWorkout,
  insertInitialScheduledWorkoutSets,
  insertRoutineExerciseRowsIntoScheduledWorkout,
  type HistoryCardSelection,
} from '@/lib/calendar/scheduled-workout-detail';
import { getRoutineDetail } from '@/lib/routines/db';
import { eq } from 'drizzle-orm';

function assertValidTime(hour: number, minute: number): void {
  // 現状の唯一の呼び出し元(schedule-time-picker.tsx)はDateTimePicker経由で常に妥当な範囲の
  // 値しか渡さないが、DBスキーマ側にCHECK制約が無いため、将来別の呼び出し元が増えた際の
  // 安全網としてここで範囲チェックする（PRレビュー指摘対応）
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`invalid hour: ${hour}`);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`invalid minute: ${minute}`);
}

// カレンダーで手動追加する予定（リマインダーとは無関係、PR10確定仕様）。呼び出し側
// （画面）でtry/catch + Alert.alertするルール（CLAUDE.md実装ルール）のため、ここでは
// エラーハンドリングをせず素直にthrowする。ルーティン予定も直接予定(addDirectScheduledWorkout)と
// 同じくscheduledWorkoutExercises/scheduledWorkoutSetsにその予定インスタンス専用の種目・目標
// セットを持たせる（2026-07-21、@ユーザー指摘）。目標セットは「ルーティン本体の実際の値」を
// そのままコピーし、以後はこの予定インスタンス側の値だけを編集する（ルーティン本体の変更は
// 過去に作成済みの予定には遡って反映されない、addRoutineExercisesToScheduledWorkoutと同じ方針）
export async function addScheduledWorkout(
  routineId: number,
  scheduledDate: string,
  hour: number,
  minute: number,
  notifyEnabled: boolean,
): Promise<number> {
  assertValidTime(hour, minute);

  // getRoutineDetailはaddDirectScheduledWorkoutと同じくdb.transactionの外側、書き込みより先に読む
  // （dbとtxを同一トランザクション内で混在させない規約、lib/workout/session.tsのcreateRoutineSession
  // と同じ）。ルーティンが削除済み、または0種目の場合は空配列にフォールバックする
  // （useCalendarDayManualScheduleが0種目ルーティンの手動予定を許容している既存仕様を踏襲）
  const detail = await getRoutineDetail(routineId);
  const exercisesToCopy = detail?.exercises ?? [];

  const now = Date.now();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(scheduledWorkouts)
      .values({ routineId, scheduledDate, hour, minute, notifyEnabled, createdAt: now, updatedAt: now })
      .returning();
    await insertRoutineExerciseRowsIntoScheduledWorkout(tx, inserted.id, exercisesToCopy, 0, now);
    return inserted.id;
  });
}

// 「直接追加」（ルーティンを介さず個別に選んだ種目で予定を作る、2026-07-20）用。routineIdは
// nullのまま、選んだ種目をscheduledWorkoutExercisesへ選択順(orderIndex)付きで挿入する。
// 各種目には目標セット（scheduledWorkoutSets、2026-07-20追加）も、その種目の直近の実績があれば
// プリフィルして作成する（種目追加ピッカーからの追加(addExercisesToScheduledWorkout)と同じ方針。
// 実施時(startWorkoutFromScheduledWorkout)はこの目標セットを優先してコピーする）
export async function addDirectScheduledWorkout(
  exerciseIds: number[],
  scheduledDate: string,
  hour: number,
  minute: number,
  notifyEnabled: boolean,
): Promise<number> {
  assertValidTime(hour, minute);
  if (exerciseIds.length === 0) throw new Error('exerciseIds must not be empty');

  const now = Date.now();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(scheduledWorkouts)
      .values({ routineId: null, scheduledDate, hour, minute, notifyEnabled, createdAt: now, updatedAt: now })
      .returning();
    const exerciseRows = await tx
      .insert(scheduledWorkoutExercises)
      .values(exerciseIds.map((exerciseId, orderIndex) => ({ scheduledWorkoutId: inserted.id, exerciseId, orderIndex, createdAt: now })))
      .returning();
    await insertInitialScheduledWorkoutSets(tx, exerciseRows, now);
    return inserted.id;
  });
}

// 「予定を追加」→「過去の記録」（app/calendar/schedule-workout-history-load.tsx経由、2026-07-25）用。
// 直接予定(routineId=null)である点はaddDirectScheduledWorkoutと同じだが、目標セットに種目ごとの
// 直近実績をプリフィルするのではなく、画面上で確認した「その過去カードそのもの」のセット値を
// コピーする。この種目・セットの入れ方は既存の「既存予定へ過去の記録から読み込み」
// (addHistoryCardsToScheduledWorkout)と全く同じ処理のため、予定枠だけ先に作って再利用する。
//
// 予定枠の作成と種目の投入が別トランザクションになるため、後者が失敗したら予定枠を消して
// 「0種目の予定だけが残る」状態を防ぐ（呼び出し側から見て、成功したか何も起きなかったかの
// どちらかになる）
export async function addHistoryScheduledWorkout(
  selections: HistoryCardSelection[],
  scheduledDate: string,
  hour: number,
  minute: number,
  notifyEnabled: boolean,
): Promise<number> {
  assertValidTime(hour, minute);
  if (selections.length === 0) throw new Error('selections must not be empty');

  const now = Date.now();
  const [inserted] = await db
    .insert(scheduledWorkouts)
    .values({ routineId: null, scheduledDate, hour, minute, notifyEnabled, createdAt: now, updatedAt: now })
    .returning();

  try {
    await addHistoryCardsToScheduledWorkout(inserted.id, selections);
  } catch (e) {
    await deleteScheduledWorkout(inserted.id).catch(() => {});
    throw e;
  }
  return inserted.id;
}

// 目標セット編集画面(app/calendar/schedule-workout-edit.tsx)のヘッダー⋮「削除」から呼ばれる
// （PR10-3、2026-07-22より選択日パネル側の⋮メニュー撤去に伴いこの画面が唯一の入口になった）。
// scheduledWorkoutExercisesはscheduledWorkoutIdにonDelete cascadeが張られているため、
// 直接予定でもこの1行を消すだけで種目も連動して消える
export async function deleteScheduledWorkout(id: number): Promise<void> {
  await db.delete(scheduledWorkouts).where(eq(scheduledWorkouts.id, id));
}
