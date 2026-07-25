import { NotFoundState } from '@/components/ui/not-found-state';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addHistoryCardsToSession } from '@/lib/workout/session';
import { createStartChooserSession } from '@/lib/workout/start-chooser-session';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// start-chooser「過去の記録」経由(newSession=1)の確定時にdismissする段数。スタックは常に
// カレンダー/記録タブ(0)→start-chooser(+1)→session-history-picker(+1)→この画面自身(+1)の3段
// （start-chooserはapp/(tabs)/(record)/index.tsx・app/(tabs)/calendar.tsxの2画面からしかpushされず、
// このnewSession経路はstart-chooserからのみ到達するため、常にこの深さで固定できる。
// app/workout/exercise-picker.tsxの同名定数と同じ根拠）
const START_CHOOSER_DISMISS_COUNT = 3;

// トレーニング画面の「過去の記録から読み込む」フロー最後の画面。選択UIの実体は
// components/workout/session-history-load-view.tsx（app/routine/session-history-load.tsxと共通）
// にあり、ここでは選択結果をDB(workoutSessionExercises)へ実際に書き込む処理だけを担う。
// start-chooser「過去の記録」経由(newSession=1)ではセッション自体もここで作る（2026-07-25、
// @ユーザー指摘: 選択画面のタップ時点で作ると、この画面や前の画面で戻ったときに空の記録が残るため）
export default function SessionHistoryLoadScreen() {
  const {
    sessionId: sessionIdParam,
    sourceSessionId: sourceSessionIdParam,
    sourceStartedAt: sourceStartedAtParam,
    newSession,
    pastDateKey,
  } = useLocalSearchParams<{
    sessionId?: string;
    sourceSessionId: string;
    sourceStartedAt: string;
    newSession?: string;
    pastDateKey?: string;
  }>();
  const isNewSession = newSession === '1';
  const sessionId = Number(sessionIdParam);
  const sourceSessionId = Number(sourceSessionIdParam);
  const sourceStartedAt = Number(sourceStartedAtParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handleSubmit = useCallback(
    async (selectedCards: SessionHistoryCard[]) => {
      try {
        const selections = selectedCards.map((c) => ({
          exerciseId: c.exerciseId,
          sourceWorkoutSessionExerciseId: c.workoutSessionExerciseId,
        }));
        const targetSessionId = isNewSession ? await createStartChooserSession(pastDateKey) : sessionId;
        const prefilled = await addHistoryCardsToSession(targetSessionId, selections);
        notifyPrefilled(prefilled);
        // start-chooser経由(newSession=1)ではトレーニング画面がまだスタックに無いため、
        // start-chooserごと閉じてから/workout/{id}をpushする（app/workout/exercise-picker.tsxの
        // 「種目を追加」経路と同じ方針）。それ以外＝トレーニング画面⋮からの通常経路では、
        // 画面3→画面2→トレーニング画面の2階層を一度に閉じるだけでよい。どちらも遷移経路が
        // 1本しか無い前提に依存するため、将来ディープリンク等 別経路が増える場合は見直すこと
        if (isNewSession) {
          router.dismiss(START_CHOOSER_DISMISS_COUNT);
          pushDebounced(`/workout/${targetSessionId}`);
        } else {
          router.dismiss(2);
        }
      } catch (e) {
        console.error('[add history cards to session]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [sessionId, router, isNewSession, pastDateKey, pushDebounced],
  );

  if ((!isNewSession && !Number.isFinite(sessionId)) || !Number.isFinite(sourceSessionId)) {
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
