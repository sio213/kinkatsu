import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryPickerView } from '@/components/workout/session-history-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { NO_SESSION_TO_EXCLUDE, type PastTrainingSession } from '@/lib/workout/history';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 「過去の記録から読み込む」フローの画面2。app/workout/session-history-picker.tsxの
// カレンダー版（2026-07-21新設）。予定には「進行中セッション」の概念が無いため、除外対象は
// 無いことを表す番兵値(NO_SESSION_TO_EXCLUDE、app/routine/session-history-picker.tsxと同じ)を渡し、
// 全ての終了済みセッションを対象にする。一覧・ページング・カテゴリ絞り込みの実体は
// components/workout/session-history-picker-view.tsx（workout/routine版と共通）。
//
// 入口は2つある（2026-07-25に新規作成経路を追加）。
// - scheduledWorkoutId付き: 既存予定の目標セット編集画面ヘッダー⋮から。選んだ種目はその予定へ追加される
// - dateKey付き: 選択日パネル「予定を追加」→「過去の記録」から。この時点では予定がまだ存在せず、
//   画面3で種目を選び、画面4(schedule-time-picker)で時刻を決めた時点で初めて予定が作られる
export default function ScheduleWorkoutHistoryPickerScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam, dateKey } = useLocalSearchParams<{
    scheduledWorkoutId?: string;
    dateKey?: string;
  }>();
  const isNewSchedule = isValidDateKey(dateKey);
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/calendar/schedule-workout-history-load',
        params: {
          ...(isNewSchedule ? { dateKey: dateKey! } : { scheduledWorkoutId: String(scheduledWorkoutId) }),
          sourceSessionId: String(session.sessionId),
          // 画面3のヘッダーで日付を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          sourceStartedAt: String(session.startedAt),
        },
      });
    },
    [pushDebounced, scheduledWorkoutId, isNewSchedule, dateKey],
  );

  if (!isNewSchedule && !Number.isFinite(scheduledWorkoutId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <>
      {/* 新規作成経路は、前後の画面(schedule-chooser/schedule-time-picker)と同じく対象日を
          ヘッダーsubtitleで常時表示する（@designer指摘: 前画面で選んだはずの日付を選択中に
          見失わないため）。既存予定への追加経路はその予定の画面から開くため日付の提示は不要 */}
      {isNewSchedule && (
        <Stack.Screen
          options={{
            headerTitle: () => (
              <HeaderTitle title="過去の記録" subtitle={formatSessionDateGroup(parseDateKey(dateKey!).getTime())} />
            ),
          }}
        />
      )}
      <SessionHistoryPickerView excludeSessionId={NO_SESSION_TO_EXCLUDE} onSelect={handleSelect} />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
