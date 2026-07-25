import { RoutineLoadView } from '@/components/routines/routine-load-view';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import type { RoutineExerciseSelection } from '@/lib/routines/db';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addRoutineExercisesToSession } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」フローの画面3。選択UIの実体は
// components/routines/routine-load-view.tsx（app/calendar/schedule-workout-routine-load.tsxと共通、
// 2026-07-21に切り出し。@reviewer指摘: カレンダー予定側に2画面目ができたことで「利用箇所は
// 1つだけ」という非共通化の前提が失効したため）にあり、ここでは選択結果をDB
// (workoutSessionExercises)へ実際に書き込む処理だけを担う
export default function RoutineLoadScreen() {
  const {
    sessionId: sessionIdParam,
    routineId: routineIdParam,
    routineName,
  } = useLocalSearchParams<{ sessionId: string; routineId: string; routineName: string }>();
  const sessionId = Number(sessionIdParam);
  const routineId = Number(routineIdParam);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (selections: RoutineExerciseSelection[]) => {
      try {
        const prefilled = await addRoutineExercisesToSession(sessionId, routineId, selections);
        notifyPrefilled(prefilled);
        // 画面3→画面2→トレーニング画面の2階層を一度に閉じる(session-history-load.tsxと同じ)
        router.dismiss(2);
      } catch (e) {
        console.error('[add routine exercises to session]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [sessionId, routineId, router],
  );

  if (!Number.isFinite(sessionId) || !Number.isFinite(routineId)) {
    return (
      <NotFoundScreen message="トレーニングが見つかりません" title="ルーティン" onPressBack={() => router.back()} />
    );
  }

  return <RoutineLoadView routineId={routineId} routineName={routineName} onSubmit={handleSubmit} />;
}
