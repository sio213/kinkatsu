import { ExerciseSwapPicker } from '@/components/exercises/exercise-swap-picker';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import type { Exercise } from '@/db/schema';
import { buildInitialRoutineSets } from '@/lib/routines/db';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

// app/workout/exercise-swap.tsxのルーティン版。DB(workoutSessionExercises)ではなく
// useRoutineDraftStoreの下書き配列を書き換える点だけが異なり、選択UI自体はExerciseSwapPickerを共有する
export default function RoutineExerciseSwapScreen() {
  const {
    index: indexParam,
    currentExerciseId: currentExerciseIdParam,
    currentExerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    index: string;
    currentExerciseId: string;
    currentExerciseName: string;
    hasRecordedData: string;
  }>();
  const index = Number(indexParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();
  const replaceExerciseAt = useRoutineDraftStore((state) => state.replaceExerciseAt);

  const handleSubmit = useCallback(
    async (exercise: Exercise) => {
      // 種目追加ピッカーで新規追加した直後と同じ状態にする方針(workout側のreplaceSessionExercise
      // と同じ考え方)。前回の実績があればプリフィルし、無ければ空欄の1セットにフォールバックする
      const newSets = await buildInitialRoutineSets(exercise.id);
      replaceExerciseAt(index, {
        exerciseId: exercise.id,
        name: exercise.name,
        category: exercise.category,
        measurementType: exercise.measurementType,
        source: exercise.source,
        slug: exercise.slug,
        sets: newSets,
      });
      router.back();
    },
    [index, replaceExerciseAt, router],
  );

  if (!Number.isFinite(index)) {
    return (
      <NotFoundScreen message="種目が見つかりません" onPressBack={() => router.back()} />
    );
  }

  return (
    <ExerciseSwapPicker
      currentExerciseId={currentExerciseId}
      currentExerciseName={currentExerciseName}
      hasRecordedData={hasRecordedData}
      confirmMessage="設定済みのセット内容は失われます。"
      onSubmit={handleSubmit}
    />
  );
}
