import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useCallback } from 'react';

/**
 * ルーティン新規作成画面（app/routine/new.tsx）へ遷移する。ルーティン選択画面のヘッダー＋ボタン
 * （components/routines/routine-create-header-button.tsx）と、0件時の空状態の主CTA
 * （components/routines/routine-picker-list.tsx）が同じ遷移を持つため共通化した。
 *
 * 下書きのresetをpush前にも行うのはapp/(tabs)/(record)/routine.tsxのhandleCreateと同じ理由で、
 * 新規作成フォームの初回描画（defaultValuesの読み込み）が作成画面側のuseEffectより前に
 * 走っても前回の下書きが一瞬見えないようにするため。
 *
 * 保存後はapp/routine/new.tsxがrouter.back()するため呼び出し元のピッカーへ戻り、一覧は
 * useRoutinesのlive queryで自動的に新しいルーティンを含む。
 */
export function useRoutineCreate() {
  const pushDebounced = useDebouncedPush();
  const resetDraft = useRoutineDraftStore((state) => state.reset);

  return useCallback(() => {
    resetDraft();
    pushDebounced('/routine/new');
  }, [resetDraft, pushDebounced]);
}
