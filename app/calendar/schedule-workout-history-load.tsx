import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey } from '@/lib/calendar/date-grid';
import { formatHistorySelectionsParam } from '@/lib/calendar/schedule';
import { addHistoryCardsToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 「過去の記録から読み込む」フローの画面3。app/workout/session-history-load.tsxの
// カレンダー版（2026-07-21新設）。選択UIの実体はcomponents/workout/session-history-load-view.tsx
// （workout/routine版と共通）にある。
//
// 入口ごとに「確定」の意味が変わる（2026-07-25に新規作成経路を追加）。
// - scheduledWorkoutId付き（既存予定の⋮から）: 選択結果をその予定
//   (scheduledWorkoutExercises/scheduledWorkoutSets)へ書き込んで画面2ごと閉じる
// - dateKey付き（選択日パネル「予定を追加」→「過去の記録」から）: 予定はまだ存在しないため
//   ここではDBに触れず、選択結果を画面4(schedule-time-picker)へ引き継ぐだけ。実際の作成は
//   時刻を確定した時点で行う（「種目を追加」「ルーティン」経路と同じ2段階構成に揃えた）
export default function ScheduleWorkoutHistoryLoadScreen() {
  const {
    scheduledWorkoutId: scheduledWorkoutIdParam,
    dateKey,
    sourceSessionId: sourceSessionIdParam,
    sourceStartedAt: sourceStartedAtParam,
  } = useLocalSearchParams<{
    scheduledWorkoutId?: string;
    dateKey?: string;
    sourceSessionId: string;
    sourceStartedAt: string;
  }>();
  const isNewSchedule = isValidDateKey(dateKey);
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const sourceSessionId = Number(sourceSessionIdParam);
  const sourceStartedAt = Number(sourceStartedAtParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handleSubmit = useCallback(
    async (selectedCards: SessionHistoryCard[]) => {
      const selections = selectedCards.map((c) => ({
        exerciseId: c.exerciseId,
        sourceWorkoutSessionExerciseId: c.workoutSessionExerciseId,
      }));
      if (isNewSchedule) {
        pushDebounced({
          pathname: '/calendar/schedule-time-picker',
          params: { dateKey: dateKey!, historySelections: formatHistorySelectionsParam(selections) },
        });
        return;
      }
      try {
        await addHistoryCardsToScheduledWorkout(scheduledWorkoutId, selections);
        // 画面3→画面2→種目編集画面の2階層を一度に閉じる(app/workout/session-history-load.tsxと同じ)
        router.dismiss(2);
      } catch (e) {
        console.error('[add history cards to scheduled workout]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [scheduledWorkoutId, isNewSchedule, dateKey, router, pushDebounced],
  );

  if ((!isNewSchedule && !Number.isFinite(scheduledWorkoutId)) || !Number.isFinite(sourceSessionId)) {
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
