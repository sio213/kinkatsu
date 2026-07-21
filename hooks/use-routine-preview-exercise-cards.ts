import { db } from '@/db/client';
import { exercises, routineExercises, routineSets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

export type RoutinePreviewExerciseSet = {
  id: number;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type RoutinePreviewExerciseDetail = {
  routineExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  measurementType: string;
  source: string;
  slug: string | null;
  sets: RoutinePreviewExerciseSet[];
};

export type UseRoutinePreviewExerciseCardsResult = {
  // hooks/use-scheduled-workout-exercises.tsのUseScheduledWorkoutExercisesResultと対称の
  // 命名にする（このフックは「生データをマージするだけ」の層で、履歴フォールバック等を足す
  // 表示カード層(hooks/use-scheduled-exercise-cards.tsのcards)とは役割が違うため、
  // @reviewer指摘: cardsという語彙は表示カード層と紛らわしい）
  exercises: RoutinePreviewExerciseDetail[];
  // hooks/use-scheduled-workout-exercises.tsのUseScheduledWorkoutExercisesResultと同じ
  // data!==undefinedパターン。「まだ読み込み中の空配列」と「読み込み済みの0件」を区別する
  loaded: boolean;
};

// まだ実体化(materializeReminderOccurrence、lib/notifications/scheduled-workout-scheduler.ts)して
// いないリマインダー予定の種目一覧プレビュー用（2026-07-21）。リマインダー由来の予定インスタンスは
// scheduledWorkouts行を持たないため、hooks/use-scheduled-workout-exercises.tsのuseScheduledWorkoutExercises
// と同じ「種目クエリ・セットクエリを別々にuseLiveQueryしJS側でマージする」パターンを、
// routineExercises/routineSetsに対して行う（leftJoinだと結合先テーブルへの書き込みで再購読されない、
// という同じ理由）。ライブ更新のため、この日パネルを開いたままルーティン編集画面で内容を変えて
// 戻ってきても即座に反映される。目標セットは「ルーティン本体の実際の値」であり、
// scheduledWorkoutSetsの「まだ何も設定していない種目」に相当する概念がそもそも無いため、
// 直近実績へのフォールバックは意図的に行わない（@tester指摘: バグと誤解して直されないよう
// 明記しておく。呼び出し側のコンポーネントが0セットの種目を「実施記録なし」的な表示に
// フォールバックさせる）
export function useRoutinePreviewExerciseCards(routineId: number): UseRoutinePreviewExerciseCardsResult {
  const { data: exerciseRows } = useLiveQuery(
    db
      .select({
        routineExerciseId: routineExercises.id,
        exerciseId: exercises.id,
        name: exercises.name,
        category: exercises.category,
        measurementType: exercises.measurementType,
        source: exercises.source,
        slug: exercises.slug,
      })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .where(eq(routineExercises.routineId, routineId))
      .orderBy(routineExercises.orderIndex),
    [routineId],
  );

  const { data: setRows } = useLiveQuery(
    db
      .select({
        routineExerciseId: routineSets.routineExerciseId,
        id: routineSets.id,
        weight: routineSets.weight,
        reps: routineSets.reps,
        durationSeconds: routineSets.durationSeconds,
        distanceMeters: routineSets.distanceMeters,
      })
      .from(routineSets)
      .innerJoin(routineExercises, eq(routineSets.routineExerciseId, routineExercises.id))
      .where(eq(routineExercises.routineId, routineId))
      .orderBy(routineSets.setNumber),
    [routineId],
  );

  const exerciseDetails = useMemo(() => {
    const setsByExercise = new Map<number, RoutinePreviewExerciseSet[]>();
    for (const row of setRows ?? []) {
      const list = setsByExercise.get(row.routineExerciseId);
      const set = {
        id: row.id,
        weight: row.weight,
        reps: row.reps,
        durationSeconds: row.durationSeconds,
        distanceMeters: row.distanceMeters,
      };
      if (list) list.push(set);
      else setsByExercise.set(row.routineExerciseId, [set]);
    }
    return (exerciseRows ?? []).map((row) => ({
      ...row,
      sets: setsByExercise.get(row.routineExerciseId) ?? [],
    }));
  }, [exerciseRows, setRows]);

  return { exercises: exerciseDetails, loaded: exerciseRows !== undefined && setRows !== undefined };
}
