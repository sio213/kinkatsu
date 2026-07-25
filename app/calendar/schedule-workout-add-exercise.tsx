import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { ScreenStyles } from '@/constants/theme';
import { addExercisesToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

// 種目編集画面(app/calendar/schedule-workout-edit.tsx)ヘッダー⋮「種目を追加」用
// （app/routine/exercise-picker.tsxのカレンダー版、2026-07-20）。選んだ種目をその場で
// scheduledWorkoutExercises/scheduledWorkoutSetsへ追加し、編集画面へ戻る
export default function ScheduleWorkoutAddExerciseScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();

  // 連打防止・失敗時のAlertはExercisePickerViewが持つため、ここは確定処理と遷移だけを書く
  const handleConfirm = useCallback(
    async (selectedIds: number[]) => {
      await addExercisesToScheduledWorkout(scheduledWorkoutId, selectedIds);
      router.back();
    },
    [scheduledWorkoutId, router],
  );

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <ExercisePickerView onConfirm={handleConfirm} />
    </SafeAreaView>
  );
}
