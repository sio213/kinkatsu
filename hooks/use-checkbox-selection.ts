import { useCallback, useState } from 'react';

// 「一覧から複数選ぶ→まとめて確定する」画面（過去の記録から読み込む、ルーティンから読み込む等）で
// 共通する選択状態の管理。全選択・件数・トグルのロジック自体はどちらの画面でも同一なため、
// 呼び出し側の型(id: number)だけを合わせれば使い回せる
export function useCheckboxSelection(ids: number[]) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const allSelected = ids.length > 0 && selectedIds.size === ids.length;

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [ids]);

  // 取得成功時に「初期状態は全選択」にするための初期化用（過去の記録・ルーティンどちらも同じ仕様）
  const selectAll = useCallback((ids: number[]) => setSelectedIds(new Set(ids)), []);

  return { selectedIds, allSelected, toggle, toggleAll, selectAll };
}
