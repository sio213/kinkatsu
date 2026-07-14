import type { WorkoutSession } from '@/db/schema';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

// トレーニング開始ボタン系の共通ロジック(記録タブの「開始」、ルーティン一覧のカードタップで共有)。
// 進行中セッションがあれば新規セッションを作らずそちらへ合流し、連打による二重セッション生成を
// isStartingRefで防ぎ、失敗時は同じ文言でAlertを出す。開始対象(素のセッション/ルーティンの中身入り
// セッション等)が呼び出し元ごとに違うため、実際にセッションを作る処理だけをstart引数として受け取る。
// 遷移方法(router.push/useDebouncedPush等)も呼び出し元ごとに違うためnavigateとして受け取る
export function useWorkoutStarter(activeSession: WorkoutSession | null, navigate: (sessionId: number) => void) {
  const isStartingRef = useRef(false);

  return useCallback(
    async (start: () => Promise<number | null>) => {
      if (activeSession) {
        navigate(activeSession.id);
        return;
      }
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      try {
        const sessionId = await start();
        if (sessionId != null) navigate(sessionId);
      } catch (e) {
        console.error('[workout session start]', e);
        Alert.alert('エラー', 'トレーニングを開始できませんでした。');
      } finally {
        isStartingRef.current = false;
      }
    },
    [activeSession, navigate],
  );
}
