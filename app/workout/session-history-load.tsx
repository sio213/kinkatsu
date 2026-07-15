import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { Colors } from '@/constants/theme';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addHistoryCardsToSession } from '@/lib/workout/session';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// トレーニング画面の「過去の記録から読み込む」フロー最後の画面。選択UIの実体は
// components/workout/session-history-load-view.tsx（app/routine/session-history-load.tsxと共通）
// にあり、ここでは選択結果をDB(workoutSessionExercises)へ実際に書き込む処理だけを担う
export default function SessionHistoryLoadScreen() {
  const {
    sessionId: sessionIdParam,
    sourceSessionId: sourceSessionIdParam,
    sourceStartedAt: sourceStartedAtParam,
  } = useLocalSearchParams<{ sessionId: string; sourceSessionId: string; sourceStartedAt: string }>();
  const sessionId = Number(sessionIdParam);
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
        const prefilled = await addHistoryCardsToSession(sessionId, selections);
        notifyPrefilled(prefilled);
        // 画面3→画面2→トレーニング画面の2階層を一度に閉じる。この画面への遷移経路が
        // 「トレーニング画面→画面2→画面3」の1本しか無い前提に依存するため、将来ディープリンク等
        // 別経路が増える場合はこの固定値を見直すこと
        router.dismiss(2);
      } catch (e) {
        console.error('[add history cards to session]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [sessionId, router],
  );

  if (!Number.isFinite(sessionId) || !Number.isFinite(sourceSessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '過去の記録' }} />
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SessionHistoryLoadView
      sourceSessionId={sourceSessionId}
      sourceStartedAt={sourceStartedAt}
      onSubmit={handleSubmit}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
