import { useWorkoutStarter } from '@/hooks/use-workout-starter';
import { endWorkoutSession } from '@/lib/workout/session';
import { useCallback } from 'react';
import { Alert } from 'react-native';

// 「種目入りで新規セッションを開始する」ボタン用の共通ロジック。ルーティン一覧のカード「開始」
// ボタン(元はapp/routine/index.tsxのhandleStartWorkout)、カレンダー選択日パネルの今日の予定
// カード「開始」ボタン（ルーティン予定・直接追加予定どちらも、2026-07-20）で挙動が同一になった
// ため共通化した。startWorkoutは呼び出し側が渡す「idからセッションを作る関数」
// （startWorkoutFromRoutine/startWorkoutFromScheduledWorkout等）に委譲し、このフック自体は
// 「進行中セッションがあれば確認を挟む」という確認ダイアログの配線だけを担う。
// 別のトレーニングが既に進行中の場合、無言でそちらへ合流すると「押したのに違うものが開いた」
// という違和感になる（実機フィードバックで指摘）ため確認を挟む。「記録して開始」では
// 進行中セッションをendWorkoutSessionで終了（記録は保存されたまま）した上で、選んだ
// 対象のセッションを新規に開始する
export function useStartWithConfirm(
  activeSession: { id: number } | null,
  navigate: (sessionId: number) => void,
  startWorkoutFrom: (id: number) => Promise<{ sessionId: number } | null>,
) {
  const startWorkout = useWorkoutStarter(navigate);

  return useCallback(
    (id: number, title: string) => {
      if (activeSession) {
        Alert.alert(
          '実施中のトレーニングを終了しますか？',
          `ここまでの記録を保存して「${title}」を開始しますか？`,
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: '記録して開始',
              onPress: () => {
                startWorkout(async () => {
                  await endWorkoutSession(activeSession.id);
                  return (await startWorkoutFrom(id))?.sessionId ?? null;
                });
              },
            },
          ],
        );
        return;
      }
      startWorkout(async () => (await startWorkoutFrom(id))?.sessionId ?? null);
    },
    [activeSession, startWorkout, startWorkoutFrom],
  );
}
