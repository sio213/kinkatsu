import { db } from '@/db/client';
import { exercises, reminders, routineExercises, routines, type Reminder, type Routine } from '@/db/schema';
import {
  createRoutine,
  deleteRoutine,
  swapRoutineOrder,
  updateRoutine,
  type RoutineInput,
  type RoutineReminderPlan,
} from '@/lib/routines/db';
import { eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export function useRoutines() {
  const { data } = useLiveQuery(db.select().from(routines).orderBy(routines.orderIndex));
  const list: Routine[] = data ?? [];

  return {
    routines: list,
    createRoutine: (input: RoutineInput, reminderPlan?: RoutineReminderPlan) => createRoutine(input, reminderPlan),
    updateRoutine: (id: number, input: RoutineInput, reminderPlan?: RoutineReminderPlan) =>
      updateRoutine(id, input, reminderPlan),
    removeRoutine: (id: number) => deleteRoutine(id),
    swapOrder: (id: number, targetId: number) => swapRoutineOrder(id, targetId),
  };
}

export type RoutineSummary = { exerciseCount: number; categories: string[] };

// ルーティン一覧カードの「N種目」「カテゴリタグ」用。routineExercisesとexercisesを1クエリで
// 購読し、routineIdごとにJS側で集計する（use-workout-session.tsのuseSessionExercises等と
// 同じ方針。ルーティンの数だけlive queryを張らずまとめて1本にする）。
// カテゴリはorderIndex順の出現順で重複除去するため、種目追加順=先頭表示の安定順になる
export function useRoutineExerciseSummaries(): Map<number, RoutineSummary> {
  const { data } = useLiveQuery(
    db
      .select({ routineId: routineExercises.routineId, category: exercises.category })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .orderBy(routineExercises.routineId, routineExercises.orderIndex),
  );

  return useMemo(() => {
    const map = new Map<number, RoutineSummary>();
    for (const row of data ?? []) {
      let entry = map.get(row.routineId);
      if (!entry) {
        entry = { exerciseCount: 0, categories: [] };
        map.set(row.routineId, entry);
      }
      entry.exerciseCount += 1;
      if (!entry.categories.includes(row.category)) entry.categories.push(row.category);
    }
    return map;
  }, [data]);
}

// ルーティン一覧カードのスケジュール行用。routineIdを持つリマインダーだけをまとめて購読し、
// routineIdごとに引けるMapにする（現時点ではリマインダー機能側がroutineIdを付与する導線が
// 無いため常に空になるが、later追加されるタスクでこのフック・カードは変更不要になる想定）
export function useRoutineReminders(): Map<number, Reminder> {
  const { data } = useLiveQuery(db.select().from(reminders).where(isNotNull(reminders.routineId)));

  return useMemo(
    () => new Map((data ?? []).flatMap((r) => (r.routineId != null ? [[r.routineId, r] as const] : []))),
    [data],
  );
}
