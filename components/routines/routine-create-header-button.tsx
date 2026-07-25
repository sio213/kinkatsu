import { HeaderAddButton } from '@/components/ui/header-add-button';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useCallback } from 'react';

// ルーティン選択画面（components/routines/routine-picker-list.tsxを使う4画面）のヘッダー右に
// 置く「ルーティンを作成」ボタン。選びたいルーティンがまだ無いとき、フローを抜けて記録タブの
// ルーティン一覧まで戻らなくてもその場で作れるようにする。1アクションだけのため⋮メニューでは
// なく、種目一覧・ルーティン一覧・リマインダー一覧と同じHeaderAddButton（＋）に揃える。
//
// 保存後はapp/routine/new.tsxがrouter.back()するため呼び出し元のピッカーへ戻り、一覧は
// useRoutinesのlive queryで自動的に新しいルーティンを含む。
// 下書きのresetをpush前にも行うのはapp/(tabs)/(record)/routine.tsxのhandleCreateと同じ理由で、
// 新規作成フォームの初回描画（defaultValuesの読み込み）が作成画面側のuseEffectより前に
// 走っても前回の下書きが一瞬見えないようにするため
export function RoutineCreateHeaderButton() {
  const pushDebounced = useDebouncedPush();
  const resetDraft = useRoutineDraftStore((state) => state.reset);

  const handlePress = useCallback(() => {
    resetDraft();
    pushDebounced('/routine/new');
  }, [resetDraft, pushDebounced]);

  return <HeaderAddButton onPress={handlePress} accessibilityLabel="ルーティンを作成" />;
}
