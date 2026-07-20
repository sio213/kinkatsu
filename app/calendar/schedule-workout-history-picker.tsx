import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryPickerView } from '@/components/workout/session-history-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { NO_SESSION_TO_EXCLUDE, type PastTrainingSession } from '@/lib/workout/history';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「過去の記録から読み込む」フローの画面2。app/workout/session-history-picker.tsxの
// カレンダー版（2026-07-21新設）。この予定には「進行中セッション」の概念が無いため、除外対象は
// 無いことを表す番兵値(NO_SESSION_TO_EXCLUDE、app/routine/session-history-picker.tsxと同じ)を渡し、
// 全ての終了済みセッションを対象にする。一覧・ページング・カテゴリ絞り込みの実体は
// components/workout/session-history-picker-view.tsx（workout/routine版と共通）
export default function ScheduleWorkoutHistoryPickerScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/calendar/schedule-workout-history-load',
        params: {
          scheduledWorkoutId: String(scheduledWorkoutId),
          sourceSessionId: String(session.sessionId),
          // 画面3のヘッダーで日付を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          sourceStartedAt: String(session.startedAt),
        },
      });
    },
    [pushDebounced, scheduledWorkoutId],
  );

  if (!Number.isFinite(scheduledWorkoutId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return <SessionHistoryPickerView excludeSessionId={NO_SESSION_TO_EXCLUDE} onSelect={handleSelect} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
