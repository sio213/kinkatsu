import { ExerciseReorderList } from '@/components/exercises/exercise-reorder-list';
import { useReorderableRows } from '@/hooks/use-reorderable-rows';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

// ドラッグ中の入れ替え表示を安定させるためのrowKey付き行。exerciseIdは同じ種目を複数回
// 追加できるため一意ではなく、配列indexは並び替えのたびに変わるため、どちらもReorderableListの
// keyExtractorには使えない。画面を開いた時点で一度だけ発番したrowKeyで代用する
type ReorderRow = DraftExercise & { rowKey: number };

function stripRowKey({ rowKey: _rowKey, ...exercise }: ReorderRow): DraftExercise {
  return exercise;
}

// ヘッダー⋮「種目を並び替え」(app/routine/exercise-edit.tsx)から開く専用画面。
// ドラッグして並び順が変わるたびにuseRoutineDraftStore.reorderExercisesへ即時反映する。
// トレーニング中(app/workout/exercise-reorder.tsx)・カレンダーの予定
// (app/calendar/schedule-workout-exercise-reorder.tsx)の並び替え画面と違い、書き込み先が
// DBではなく下書きストア(同期処理)のため実際には失敗しないが、状態管理・巻き戻しの仕組みは
// useReorderableRowsで共通化している
export default function RoutineExerciseReorderScreen() {
  const router = useRouter();
  const reorderExercises = useRoutineDraftStore((state) => state.reorderExercises);
  // 表示するのは画面を開いた時点のスナップショットのみで、開いている間に他画面からexercisesが
  // 変わることは無いため、以降はuseRoutineDraftStoreを購読せずrows(ローカル)だけで描画を駆動する。
  // rowKeyの発番も含め一度だけ確定させたいのでuseStateの初期化関数で固定する
  const [source] = useState<ReorderRow[]>(() =>
    useRoutineDraftStore.getState().exercises.map((e, i) => ({ ...e, rowKey: i })),
  );

  const persist = useCallback(
    (next: ReorderRow[]) => {
      reorderExercises(next.map(stripRowKey));
    },
    [reorderExercises],
  );

  const { rows, handleReorder, handleMove } = useReorderableRows({
    source,
    persist,
    errorMessage: '種目を並び替えられませんでした。',
    logLabel: '[reorder routine draft exercises]',
  });

  return (
    <ExerciseReorderList
      rows={rows}
      keyExtractor={(item) => String(item.rowKey)}
      setCountOf={(item) => item.sets.length}
      onReorder={handleReorder}
      onMove={handleMove}
      onPressBack={() => router.back()}
    />
  );
}
