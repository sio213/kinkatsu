import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { Colors } from '@/constants/theme';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { historyCardsToDraftExercises } from '@/lib/routines/validation';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ルーティンの「過去の記録から読み込む」フロー最後の画面(app/workout/session-history-load.tsxの
// ルーティン版)。選択UIの実体はcomponents/workout/session-history-load-view.tsx(workout版と共通)
// にあり、ここでは選択結果を下書きストア(useRoutineDraftStore)へ追加する処理だけを担う。
// DB書き込みが無い同期処理のため、workout版と違いtry/catchは不要(reorderExercises等と同じ扱い)
export default function RoutineSessionHistoryLoadScreen() {
  const { sourceSessionId: sourceSessionIdParam, sourceStartedAt: sourceStartedAtParam } = useLocalSearchParams<{
    sourceSessionId: string;
    sourceStartedAt: string;
  }>();
  const sourceSessionId = Number(sourceSessionIdParam);
  const sourceStartedAt = Number(sourceStartedAtParam);
  const router = useRouter();
  const addExercises = useRoutineDraftStore((state) => state.addExercises);

  const handleSubmit = useCallback(
    async (selectedCards: SessionHistoryCard[]) => {
      addExercises(historyCardsToDraftExercises(selectedCards));
      // 画面2→画面1→種目を編集の2階層を一度に閉じる。この画面への遷移経路が
      // 「種目を編集→画面1→画面2」の1本しか無い前提に依存するため、将来ディープリンク等
      // 別経路が増える場合はこの固定値を見直すこと(workout/session-history-load.tsxと同じ方針)
      router.dismiss(2);
    },
    [addExercises, router],
  );

  if (!Number.isFinite(sourceSessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '過去の記録' }} />
        <NotFoundState message="記録が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
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
