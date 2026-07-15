import { RoutineReorderExerciseCard } from '@/components/routines/routine-reorder-exercise-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ReorderableList, { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

// ドラッグ中の入れ替え表示を安定させるためのrowKey付き行。exerciseIdは同じ種目を複数回
// 追加できるため一意ではなく、配列indexは並び替えのたびに変わるため、どちらもReorderableListの
// keyExtractorには使えない。画面を開いた時点で一度だけ発番したrowKeyで代用する
type ReorderRow = DraftExercise & { rowKey: number };

function stripRowKey({ rowKey: _rowKey, ...exercise }: ReorderRow): DraftExercise {
  return exercise;
}

// ヘッダー⋮「種目を並び替え」(app/routine/exercise-edit.tsx)から開く専用画面。
// ドラッグして並び順が変わるたびにuseRoutineDraftStore.reorderExercisesへ即時反映する。
// 他のドラフト系画面(exercise-edit.tsxの「保存」等)と同じく、この画面の「保存」も
// 実処理を持たない見た目上の確定＝戻るボタン
export default function RoutineExerciseReorderScreen() {
  const router = useRouter();
  const reorderExercises = useRoutineDraftStore((state) => state.reorderExercises);
  // 表示するのは画面を開いた時点のスナップショットのみで、開いている間に他画面からexercisesが
  // 変わることは無いため、以降はuseRoutineDraftStoreを購読せずrows(ローカル)だけで描画を駆動する
  const [rows, setRows] = useState<ReorderRow[]>(() =>
    useRoutineDraftStore.getState().exercises.map((e, i) => ({ ...e, rowKey: i })),
  );

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      const next = reorderItems(rows, from, to);
      setRows(next);
      reorderExercises(next.map(stripRowKey));
    },
    [rows, reorderExercises],
  );

  // ドラッグ操作は支援技術から実行できないため、各行のドラッグハンドルに上へ/下へ移動の
  // accessibilityActionsを提供し、隣接1件だけの入れ替えという形で同じ並び替えを代替する
  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= rows.length) return;
      const next = reorderItems(rows, index, targetIndex);
      setRows(next);
      reorderExercises(next.map(stripRowKey));
    },
    [rows, reorderExercises],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ReorderableList
        data={rows}
        onReorder={handleReorder}
        renderItem={({ item, index }) => (
          <RoutineReorderExerciseCard
            exercise={item}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onMoveUp={() => handleMove(index, 'up')}
            onMoveDown={() => handleMove(index, 'down')}
          />
        )}
        keyExtractor={(item) => String(item.rowKey)}
        shouldUpdateActiveItem
        style={styles.list}
        contentContainerStyle={styles.content}
        renderDropIndicator={() => (
          <View style={styles.dropIndicator}>
            <View style={styles.dropIndicatorDot} />
          </View>
        )}
      />
      <View style={styles.footer}>
        <PrimaryButton label="保存" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 8 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dropIndicator: {
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.accent,
    marginHorizontal: 6,
  },
  dropIndicatorDot: {
    position: 'absolute',
    left: -1,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
});
