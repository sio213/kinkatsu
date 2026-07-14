import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

// トレーニング開始ボタン系の共通ロジック(記録タブの「開始」、ルーティン一覧のカードタップで共有)。
// 連打による二重セッション生成をisStartingRefで防ぎ、失敗時は同じ文言でAlertを出す。開始対象
// (素のセッション/ルーティンの中身入りセッション等)が呼び出し元ごとに違うため、実際にセッションを
// 作る処理だけをstart引数として受け取る。遷移方法(router.push/useDebouncedPush等)も呼び出し元
// ごとに違うためnavigateとして受け取る。
// 「進行中セッションが既にある場合どうするか」はこのフックの外(呼び出し元)で判断する。記録タブの
// 「開始/再開」ボタンでは無条件でそちらへ合流する一方、ルーティン一覧のカードタップでは無言で
// 別のトレーニングが開くと違和感があるため確認を挟みたい、というように画面ごとに扱いが異なるため
export function useWorkoutStarter(navigate: (sessionId: number) => void) {
  const isStartingRef = useRef(false);

  return useCallback(
    async (start: () => Promise<number | null>) => {
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
    [navigate],
  );
}
