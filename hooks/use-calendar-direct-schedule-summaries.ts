import { db } from '@/db/client';
import { exercises, scheduledWorkoutExercises } from '@/db/schema';
import { groupExerciseNamesByScheduleId } from '@/lib/calendar/schedule';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type DirectScheduleSummary = {
  exerciseCount: number;
  categories: string[];
  exerciseNames: string[];
};

// カレンダーの「直接追加」予定（ルーティンを介さず個別に選んだ種目、2026-07-20）用。
// hooks/use-routines.tsのuseRoutineExerciseSummariesと対になるフックで、集計方針
// （カテゴリは件数が多い順、同数は初登場順）もそのまま揃える。exerciseNamesは
// lib/calendar/schedule.tsのformatDirectScheduleTitleへそのまま渡せるよう選択順(orderIndex順)を保つ
export function useCalendarDirectScheduleSummaries(): Map<number, DirectScheduleSummary> {
  const { data } = useLiveQuery(
    db
      .select({
        scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
        category: exercises.category,
        name: exercises.name,
      })
      .from(scheduledWorkoutExercises)
      .innerJoin(exercises, eq(scheduledWorkoutExercises.exerciseId, exercises.id))
      .orderBy(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutExercises.orderIndex),
  );

  return useMemo(() => {
    const rows = data ?? [];
    const exerciseCounts = new Map<number, number>();
    const categoryCounts = new Map<number, Map<string, number>>();

    for (const row of rows) {
      exerciseCounts.set(row.scheduledWorkoutId, (exerciseCounts.get(row.scheduledWorkoutId) ?? 0) + 1);

      let counts = categoryCounts.get(row.scheduledWorkoutId);
      if (!counts) {
        counts = new Map();
        categoryCounts.set(row.scheduledWorkoutId, counts);
      }
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    const namesById = groupExerciseNamesByScheduleId(rows);

    const map = new Map<number, DirectScheduleSummary>();
    for (const [scheduledWorkoutId, counts] of categoryCounts) {
      const categories = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
      map.set(scheduledWorkoutId, {
        exerciseCount: exerciseCounts.get(scheduledWorkoutId) ?? 0,
        categories,
        exerciseNames: namesById.get(scheduledWorkoutId) ?? [],
      });
    }
    return map;
  }, [data]);
}
