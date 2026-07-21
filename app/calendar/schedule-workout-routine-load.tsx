import { RoutineLoadView } from '@/components/routines/routine-load-view';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { addRoutineExercisesToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import type { RoutineExerciseSelection } from '@/lib/routines/db';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「ルーティンから読み込む」フローの画面3。選択UIの実体は
// components/routines/routine-load-view.tsx（app/workout/routine-load.tsxと共通）にあり、
// ここでは選択結果をこの予定(scheduledWorkoutExercises/scheduledWorkoutSets)へ実際に
// 書き込む処理だけを担う
export default function ScheduleWorkoutRoutineLoadScreen() {
  const {
    scheduledWorkoutId: scheduledWorkoutIdParam,
    routineId: routineIdParam,
    routineName,
  } = useLocalSearchParams<{ scheduledWorkoutId: string; routineId: string; routineName: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const routineId = Number(routineIdParam);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (selections: RoutineExerciseSelection[]) => {
      try {
        await addRoutineExercisesToScheduledWorkout(scheduledWorkoutId, routineId, selections);
        // 画面3→画面2→種目編集画面の2階層を一度に閉じる(app/workout/routine-load.tsxと同じ)
        router.dismiss(2);
      } catch (e) {
        console.error('[add routine exercises to scheduled workout]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [scheduledWorkoutId, routineId, router],
  );

  if (!Number.isFinite(scheduledWorkoutId) || !Number.isFinite(routineId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティン' }} />
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return <RoutineLoadView routineId={routineId} routineName={routineName} onSubmit={handleSubmit} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
