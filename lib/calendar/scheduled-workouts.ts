import { db } from '@/db/client';
import { scheduledWorkoutExercises, scheduledWorkouts } from '@/db/schema';
import { eq } from 'drizzle-orm';

function assertValidTime(hour: number, minute: number): void {
  // 現状の唯一の呼び出し元(schedule-time-picker.tsx)はDateTimePicker経由で常に妥当な範囲の
  // 値しか渡さないが、DBスキーマ側にCHECK制約が無いため、将来別の呼び出し元が増えた際の
  // 安全網としてここで範囲チェックする（PRレビュー指摘対応）
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`invalid hour: ${hour}`);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`invalid minute: ${minute}`);
}

// addDirectScheduledWorkout/updateScheduledWorkoutExercises共通のinsert values生成（@reviewer指摘）
function toScheduledExerciseRows(scheduledWorkoutId: number, exerciseIds: number[], now: number) {
  return exerciseIds.map((exerciseId, orderIndex) => ({
    scheduledWorkoutId,
    exerciseId,
    orderIndex,
    createdAt: now,
  }));
}

// カレンダーで手動追加する予定（リマインダーとは無関係、PR10確定仕様）。呼び出し側
// （画面）でtry/catch + Alert.alertするルール（CLAUDE.md実装ルール）のため、ここでは
// エラーハンドリングをせず素直にthrowする
export async function addScheduledWorkout(
  routineId: number,
  scheduledDate: string,
  hour: number,
  minute: number,
): Promise<number> {
  assertValidTime(hour, minute);

  const now = Date.now();
  const [inserted] = await db
    .insert(scheduledWorkouts)
    .values({ routineId, scheduledDate, hour, minute, createdAt: now, updatedAt: now })
    .returning();
  return inserted.id;
}

// 「直接追加」（ルーティンを介さず個別に選んだ種目で予定を作る、2026-07-20）用。routineIdは
// nullのまま、選んだ種目をscheduledWorkoutExercisesへ選択順(orderIndex)付きで挿入する
export async function addDirectScheduledWorkout(
  exerciseIds: number[],
  scheduledDate: string,
  hour: number,
  minute: number,
): Promise<number> {
  assertValidTime(hour, minute);
  if (exerciseIds.length === 0) throw new Error('exerciseIds must not be empty');

  const now = Date.now();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(scheduledWorkouts)
      .values({ routineId: null, scheduledDate, hour, minute, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(scheduledWorkoutExercises).values(toScheduledExerciseRows(inserted.id, exerciseIds, now));
    return inserted.id;
  });
}

// 「直接追加」予定の種目一覧をまとめて編集する画面（schedule-exercise-picker.tsxの編集モード、
// 2026-07-20）用。既存のscheduledWorkoutExercisesを一旦全て削除し、新しい選択順で入れ直す
// （個々の行をdiffして増減させるより、選択内容全体を置き換える方が実装・検証ともに単純なため。
// 過去の実績には触れない別テーブルのため、入れ替えても記録に影響しない）
export async function updateScheduledWorkoutExercises(scheduledWorkoutId: number, exerciseIds: number[]): Promise<void> {
  if (exerciseIds.length === 0) throw new Error('exerciseIds must not be empty');

  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.delete(scheduledWorkoutExercises).where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId));
    await tx.insert(scheduledWorkoutExercises).values(toScheduledExerciseRows(scheduledWorkoutId, exerciseIds, now));
    await tx.update(scheduledWorkouts).set({ updatedAt: now }).where(eq(scheduledWorkouts.id, scheduledWorkoutId));
  });
}

// 選択日パネルの手動予定カードの⋮メニュー「削除」から呼ばれる（PR10-3、
// components/calendar/routine-schedule-card.tsx・app/(tabs)/calendar.tsxのhandleDeleteSchedule）。
// scheduledWorkoutExercisesはscheduledWorkoutIdにonDelete cascadeが張られているため、
// 直接予定でもこの1行を消すだけで種目も連動して消える
export async function deleteScheduledWorkout(id: number): Promise<void> {
  await db.delete(scheduledWorkouts).where(eq(scheduledWorkouts.id, id));
}
