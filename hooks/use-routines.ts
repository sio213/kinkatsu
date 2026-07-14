import { db } from '@/db/client';
import { exercises, reminders, routineExercises, routines, type Reminder, type Routine } from '@/db/schema';
import {
  createRoutine,
  deleteRoutine,
  swapRoutineOrder,
  updateRoutine,
  type RoutineInput,
} from '@/lib/routines/db';
import { eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export function useRoutines() {
  const { data } = useLiveQuery(db.select().from(routines).orderBy(routines.orderIndex));
  const list: Routine[] = data ?? [];

  return {
    routines: list,
    createRoutine: (input: RoutineInput) => createRoutine(input),
    updateRoutine: (id: number, input: RoutineInput) => updateRoutine(id, input),
    removeRoutine: (id: number) => deleteRoutine(id),
    swapOrder: (id: number, targetId: number) => swapRoutineOrder(id, targetId),
  };
}

export type RoutineSummary = { exerciseCount: number; categories: string[] };

// ルーティン一覧カードの「N種目」「カテゴリタグ」用。routineExercisesとexercisesを1クエリで
// 購読し、routineIdごとにJS側で集計する（use-workout-session.tsのuseSessionExercises等と
// 同じ方針。ルーティンの数だけlive queryを張らずまとめて1本にする）。
// カテゴリはそのカテゴリに属する種目数が多い順に並べる（例: 胸3・腹筋2・脚1なら「胸,腹筋,脚」）。
// 件数が同じカテゴリ同士は種目追加順(先に登場した方が先)で安定させる
export function useRoutineExerciseSummaries(): Map<number, RoutineSummary> {
  const { data } = useLiveQuery(
    db
      .select({ routineId: routineExercises.routineId, category: exercises.category })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .orderBy(routineExercises.routineId, routineExercises.orderIndex),
  );

  return useMemo(() => {
    const exerciseCounts = new Map<number, number>();
    // カテゴリごとの件数をルーティンごとに集計する。Mapはキーを挿入順で反復する仕様のため、
    // このMap自身のキー順がそのまま「初登場順」になり、件数が同じ場合のタイブレークにそのまま使える
    // （初登場順を別配列で並行して持つ必要が無い）
    const categoryCounts = new Map<number, Map<string, number>>();

    for (const row of data ?? []) {
      exerciseCounts.set(row.routineId, (exerciseCounts.get(row.routineId) ?? 0) + 1);

      let counts = categoryCounts.get(row.routineId);
      if (!counts) {
        counts = new Map();
        categoryCounts.set(row.routineId, counts);
      }
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }

    const map = new Map<number, RoutineSummary>();
    for (const [routineId, counts] of categoryCounts) {
      // Array.prototype.sortは安定ソートのため、Mapのキー(=初登場順)を元に並べ替えれば
      // 件数が同じカテゴリの相対順は初登場順のまま保たれる
      const categories = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
      map.set(routineId, { exerciseCount: exerciseCounts.get(routineId) ?? 0, categories });
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
