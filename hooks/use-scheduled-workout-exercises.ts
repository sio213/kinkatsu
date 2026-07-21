import { db } from '@/db/client';
import { exercises, scheduledWorkoutExercises, scheduledWorkoutSets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type ScheduledWorkoutExerciseSet = {
  id: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type ScheduledWorkoutExerciseDetail = {
  scheduledWorkoutExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: ScheduledWorkoutExerciseSet[];
};

export type UseScheduledWorkoutExercisesResult = {
  exercises: ScheduledWorkoutExerciseDetail[];
  // 種目クエリ・セットクエリの両方が初回解決を終えたかどうか。hooks/use-scheduled-workout.tsの
  // useScheduledWorkoutTimeと同じdata!==undefinedパターン。呼び出し側（schedule-workout-edit.tsx
  // の種目追加時の自動スクロール等）が「まだ読み込み中の空配列」と「読み込み済みの0件」を
  // 区別する必要があるために公開する（@reviewer指摘: 区別できないとロード完了時の初回データ到着を
  // 「種目が追加された」と誤検知してしまう）
  loaded: boolean;
};

// 直接予定の種目一覧をまとめて編集する画面（app/calendar/schedule-workout-edit.tsx、2026-07-20）用。
// 種目一覧(scheduledWorkoutExercises)・目標セット(scheduledWorkoutSets)を別々のlive queryで取得し
// JS側でグルーピングする（leftJoinだと結合先テーブルへの書き込みで再購読されない、
// hooks/use-workout-session.tsのuseResumeWorkoutSummaryと同じ理由でuseSessionSets等と同じ
// パターンに揃える）。それぞれのクエリの主テーブル（.from()の対象）への書き込みで独立に再購読される
export function useScheduledWorkoutExercises(scheduledWorkoutId: number): UseScheduledWorkoutExercisesResult {
  const { data: exerciseRows } = useLiveQuery(
    db
      .select({
        scheduledWorkoutExerciseId: scheduledWorkoutExercises.id,
        exerciseId: exercises.id,
        name: exercises.name,
        category: exercises.category,
        measurementType: exercises.measurementType,
        source: exercises.source,
        slug: exercises.slug,
      })
      .from(scheduledWorkoutExercises)
      .innerJoin(exercises, eq(scheduledWorkoutExercises.exerciseId, exercises.id))
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .orderBy(scheduledWorkoutExercises.orderIndex),
    [scheduledWorkoutId],
  );

  const { data: setRows } = useLiveQuery(
    db
      .select({
        scheduledWorkoutExerciseId: scheduledWorkoutSets.scheduledWorkoutExerciseId,
        id: scheduledWorkoutSets.id,
        weight: scheduledWorkoutSets.weight,
        reps: scheduledWorkoutSets.reps,
        durationSeconds: scheduledWorkoutSets.durationSeconds,
        distanceMeters: scheduledWorkoutSets.distanceMeters,
      })
      .from(scheduledWorkoutSets)
      .innerJoin(scheduledWorkoutExercises, eq(scheduledWorkoutSets.scheduledWorkoutExerciseId, scheduledWorkoutExercises.id))
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .orderBy(scheduledWorkoutSets.setNumber),
    [scheduledWorkoutId],
  );

  const exerciseDetails = useMemo(() => {
    const setsByExercise = new Map<number, ScheduledWorkoutExerciseSet[]>();
    for (const row of setRows ?? []) {
      const list = setsByExercise.get(row.scheduledWorkoutExerciseId);
      const set = { id: row.id, weight: row.weight, reps: row.reps, durationSeconds: row.durationSeconds, distanceMeters: row.distanceMeters };
      if (list) list.push(set);
      else setsByExercise.set(row.scheduledWorkoutExerciseId, [set]);
    }
    return (exerciseRows ?? []).map((row) => ({
      ...row,
      sets: setsByExercise.get(row.scheduledWorkoutExerciseId) ?? [],
    }));
  }, [exerciseRows, setRows]);

  return { exercises: exerciseDetails, loaded: exerciseRows !== undefined && setRows !== undefined };
}
