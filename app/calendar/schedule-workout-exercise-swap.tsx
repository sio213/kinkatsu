import { ExerciseSwapPicker } from '@/components/exercises/exercise-swap-picker';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { replaceScheduledWorkoutExercise } from '@/lib/calendar/scheduled-workout-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 種目カード⋮メニュー「種目を入れ替え」用（app/routine/exercise-swap.tsxのカレンダー版、
// 2026-07-20）。選択UI自体はExerciseSwapPickerを共有し、確定処理だけがDB
// (scheduledWorkoutExercises/scheduledWorkoutSets)への書き込みになる
export default function ScheduleWorkoutExerciseSwapScreen() {
  const {
    scheduledWorkoutExerciseId: scheduledWorkoutExerciseIdParam,
    currentExerciseId: currentExerciseIdParam,
    currentExerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    scheduledWorkoutExerciseId: string;
    currentExerciseId: string;
    currentExerciseName: string;
    hasRecordedData: string;
  }>();
  const scheduledWorkoutExerciseId = Number(scheduledWorkoutExerciseIdParam);
  const currentExerciseId = Number(currentExerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();

  const handleSubmit = useCallback(
    async (exercise: Exercise) => {
      await replaceScheduledWorkoutExercise(scheduledWorkoutExerciseId, exercise.id);
      router.back();
    },
    [scheduledWorkoutExerciseId, router],
  );

  if (!Number.isFinite(scheduledWorkoutExerciseId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="種目が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <ExerciseSwapPicker
      currentExerciseId={currentExerciseId}
      currentExerciseName={currentExerciseName}
      hasRecordedData={hasRecordedData}
      confirmMessage="設定済みの目標セットは失われます。"
      onSubmit={handleSubmit}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
