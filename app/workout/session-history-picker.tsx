import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryPickerView, PAGE_SIZE } from '@/components/workout/session-history-picker-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import type { PastTrainingSession } from '@/lib/workout/history';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export { PAGE_SIZE };

// トレーニング画面ヘッダー⋮「過去の記録から読み込む」から開く画面。一覧・ページング・
// カテゴリ絞り込みの実体はcomponents/workout/session-history-picker-view.tsx
// （app/routine/session-history-picker.tsxと共通）にあり、ここでは自分自身のセッションを
// 実績候補から除外する指定と、選択後の遷移先だけを担う
export default function SessionHistoryPickerScreen() {
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/workout/session-history-load',
        params: {
          sessionId: String(sessionId),
          sourceSessionId: String(session.sessionId),
          // 画面3のヘッダーで日付を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          sourceStartedAt: String(session.startedAt),
        },
      });
    },
    [pushDebounced, sessionId],
  );

  if (!Number.isFinite(sessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return <SessionHistoryPickerView excludeSessionId={sessionId} onSelect={handleSelect} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
