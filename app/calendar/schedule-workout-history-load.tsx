import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { Colors } from '@/constants/theme';
import { addHistoryCardsToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「過去の記録から読み込む」フローの画面3。app/workout/session-history-load.tsxの
// カレンダー版（2026-07-21新設）。選択UIの実体はcomponents/workout/session-history-load-view.tsx
// （workout/routine版と共通）にあり、ここでは選択結果をこの予定
// (scheduledWorkoutExercises/scheduledWorkoutSets)へ実際に書き込む処理だけを担う
export default function ScheduleWorkoutHistoryLoadScreen() {
  const {
    scheduledWorkoutId: scheduledWorkoutIdParam,
    sourceSessionId: sourceSessionIdParam,
    sourceStartedAt: sourceStartedAtParam,
  } = useLocalSearchParams<{ scheduledWorkoutId: string; sourceSessionId: string; sourceStartedAt: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const sourceSessionId = Number(sourceSessionIdParam);
  const sourceStartedAt = Number(sourceStartedAtParam);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (selectedCards: SessionHistoryCard[]) => {
      try {
        const selections = selectedCards.map((c) => ({
          exerciseId: c.exerciseId,
          sourceWorkoutSessionExerciseId: c.workoutSessionExerciseId,
        }));
        await addHistoryCardsToScheduledWorkout(scheduledWorkoutId, selections);
        // 画面3→画面2→種目編集画面の2階層を一度に閉じる(app/workout/session-history-load.tsxと同じ)
        router.dismiss(2);
      } catch (e) {
        console.error('[add history cards to scheduled workout]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [scheduledWorkoutId, router],
  );

  if (!Number.isFinite(scheduledWorkoutId) || !Number.isFinite(sourceSessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '過去の記録' }} />
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SessionHistoryLoadView sourceSessionId={sourceSessionId} sourceStartedAt={sourceStartedAt} onSubmit={handleSubmit} />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
