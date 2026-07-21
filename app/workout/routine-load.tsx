import { RoutineLoadView } from '@/components/routines/routine-load-view';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { RoutineExerciseSelection } from '@/lib/routines/db';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addRoutineExercisesToSession } from '@/lib/workout/session';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティン' }} />
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return <RoutineLoadView routineId={routineId} routineName={routineName} onSubmit={handleSubmit} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
