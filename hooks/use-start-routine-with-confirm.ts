import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { endWorkoutSession, startWorkoutFromRoutine } from '@/lib/workout/session';
import { useCallback } from 'react';
import { Alert } from 'react-native';

// 「ルーティンの中身入りで新規セッションを開始する」ボタン用の共通ロジック。
// ルーティン一覧のカード「開始」ボタン(元はapp/routine/index.tsxのhandleStartWorkout)と、
// カレンダー選択日パネルの今日の予定カード「開始」ボタンで挙動が同一になったため共通化した。
// 別のトレーニングが既に進行中の場合、無言でそちらへ合流すると「押したのに違うものが開いた」
// という違和感になる（実機フィードバックで指摘）ため確認を挟む。「記録して開始」では
// 進行中セッションをendWorkoutSessionで終了（記録は保存されたまま）した上で、選んだ
// ルーティンのセッションを新規に開始する
export function useStartRoutineWithConfirm(activeSession: { id: number } | null, navigate: (sessionId: number) => void) {
  const startWorkout = useWorkoutStarter(navigate);

  return useCallback(
    (routineId: number, routineName: string) => {
      if (activeSession) {
        Alert.alert(
          '実施中のトレーニングを終了しますか？',
          `ここまでの記録を保存して「${routineName}」を開始しますか？`,
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: '記録して開始',
              onPress: () => {
                startWorkout(async () => {
                  await endWorkoutSession(activeSession.id);
                  return (await startWorkoutFromRoutine(routineId))?.sessionId ?? null;
                });
              },
            },
          ],
        );
        return;
      }
      startWorkout(async () => (await startWorkoutFromRoutine(routineId))?.sessionId ?? null);
    },
    [activeSession, startWorkout],
  );
}
