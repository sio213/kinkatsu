import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { addExercisesToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 種目編集画面(app/calendar/schedule-workout-edit.tsx)ヘッダー⋮「種目を追加」用
// （app/routine/exercise-picker.tsxのカレンダー版、2026-07-20）。選んだ種目をその場で
// scheduledWorkoutExercises/scheduledWorkoutSetsへ追加し、編集画面へ戻る
export default function ScheduleWorkoutAddExerciseScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const isAddingRef = useRef(false);

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleConfirm = useCallback(
    async (selectedIds: number[]) => {
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      try {
        await addExercisesToScheduledWorkout(scheduledWorkoutId, selectedIds);
        router.back();
      } catch (e) {
        console.error('[scheduled workout add exercises]', e);
        Alert.alert('エラー', '種目を追加できませんでした。');
      } finally {
        isAddingRef.current = false;
      }
    },
    [scheduledWorkoutId, router],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ExercisePickerView onPressInfo={handlePressInfo} onConfirm={handleConfirm} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
