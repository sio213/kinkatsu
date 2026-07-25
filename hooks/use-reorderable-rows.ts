import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list';

type Options<T> = {
  // 並び替え対象の元データ。live query(useSessionExercises等)でもドラフトストアの
  // スナップショットでもよい。最初に1件以上入った時点で一度だけrowsへ取り込み、以降は
  // 更新を無視する(ドラッグ中にDB更新由来の再購読が割り込むと、並び替え中の表示と競合するため)。
  // 並び替え画面は種目2件以上でしか開けない(呼び出し元でガード済み)ため、初回に1件でも
  // 来た時点で取り込めば十分
  source: T[];
  // 確定した並び順の永続化。DB書き込み(Promise)でもドラフトストアの同期更新でもよい。
  // 失敗時はthrow/rejectするだけでよく、Alert表示と表示の巻き戻しはこのフックが担う。
  // 依存配列を安定させるため呼び出し側でuseCallbackすること
  persist: (next: T[]) => void | Promise<void>;
  // 永続化に失敗したときのAlert本文。同じ操作を他の画面(⋮メニューの「上へ移動」等)からも
  // 行える場合があるため、文言はそちらと揃えられるよう呼び出し側から渡す
  errorMessage: string;
  // console.errorの先頭に付けるラベル(例: '[reorder session exercises]')
  logLabel: string;
};

// 「種目まとめて並び替え」画面3本(ルーティン下書き/トレーニング中セッション/カレンダーの予定)で
// 共有する並び替えの状態管理。ドラッグ確定・支援技術からの隣接1件移動のどちらも、楽観的に表示を
// 更新してからpersistし、失敗したらAlertを出して直前の並びへ巻き戻す
export function useReorderableRows<T>({ source, persist, errorMessage, logLabel }: Options<T>) {
  const seededRef = useRef(false);
  const [rows, setRows] = useState<T[]>([]);
  if (!seededRef.current && source.length > 0) {
    seededRef.current = true;
    setRows(source);
  }

  // 素早い連続ドラッグ等で複数の永続化が同時に走った場合、先に失敗した古い操作の巻き戻しが
  // 後から成功した新しい操作の結果を上書きしないよう、常に最新の操作だけが巻き戻しを行えるようにする
  const latestOperationRef = useRef(0);

  const applyOrder = useCallback(
    (next: T[], previous: T[]) => {
      setRows(next);
      const operationId = ++latestOperationRef.current;
      // persist自体は同期的に呼ぶ(await前の式評価まではこの即時関数も同期実行される)。
      // マイクロタスクへ遅延させると、確定直後に永続化を検証している呼び出し側・テストから
      // 「まだ呼ばれていない」ように見えてしまう
      void (async () => {
        try {
          await persist(next);
        } catch (e) {
          console.error(logLabel, e);
          Alert.alert('エラー', errorMessage);
          if (operationId === latestOperationRef.current) setRows(previous);
        }
      })();
    },
    [persist, errorMessage, logLabel],
  );

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      applyOrder(reorderItems(rows, from, to), rows);
    },
    [rows, applyOrder],
  );

  // ドラッグ操作は支援技術から実行できないため、各行のドラッグハンドルに上へ/下へ移動の
  // accessibilityActionsを提供し、隣接1件だけの入れ替えという形で同じ並び替えを代替する
  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= rows.length) return;
      applyOrder(reorderItems(rows, index, targetIndex), rows);
    },
    [rows, applyOrder],
  );

  return { rows, handleReorder, handleMove };
}
