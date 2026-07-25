import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { SessionHistoryLoadView } from '@/components/workout/session-history-load-view';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addHistoryCardsToSession } from '@/lib/workout/session';
import { START_CHOOSER_DISMISS_COUNT } from '@/lib/workout/start-chooser-navigation';
import { createStartChooserSession } from '@/lib/workout/start-chooser-session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

// トレーニング画面⋮からの通常経路で確定したときにdismissする段数。この画面(画面3)と
// 一覧(画面2)を閉じるとトレーニング画面に戻る。start-chooser経由の段数
// (START_CHOOSER_DISMISS_COUNT)とは起点も意味も別なので、そちらには含めない
const DISMISS_TO_WORKOUT_SCREEN = 2;

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
          router.dismiss(START_CHOOSER_DISMISS_COUNT.fromGrandchild);
          pushDebounced(`/workout/${targetSessionId}`);
        } else {
          router.dismiss(DISMISS_TO_WORKOUT_SCREEN);
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
      <NotFoundScreen message="トレーニングが見つかりません" title="過去の記録" onPressBack={() => router.back()} />
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
