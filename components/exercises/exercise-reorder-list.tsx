import { ReorderableExerciseRow, type ReorderableExercise } from '@/components/exercises/reorderable-exercise-row';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';
import ReorderableList, { type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props<T extends ReorderableExercise> = {
  rows: T[];
  // 同じ種目を複数回追加できるためexerciseIdは一意ではなく、配列indexは並び替えのたびに
  // 変わるため、どちらもkeyExtractorには使えない。行を一意に識別できる値を呼び出し側で用意する
  keyExtractor: (row: T) => string;
  // セット数の求め方が呼び出し元で異なる(行に同梱されている/別のlive queryから引く)ため関数で受ける
  setCountOf: (row: T) => number;
  onReorder: (event: ReorderableListReorderEvent) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onPressBack: () => void;
};

// 「種目まとめて並び替え」画面の描画本体。app/routine/exercise-reorder.tsx(ルーティン下書き)・
// app/workout/exercise-reorder.tsx(トレーニング中セッション)・
// app/calendar/schedule-workout-exercise-reorder.tsx(カレンダーの予定)の3画面が
// 同じ描画(ReorderableList・ドロップインジケータ・フッターの「戻る」)を持つに至ったため共通化した。
// 並び順の状態管理・永続化はhooks/use-reorderable-rows.tsが担い、この画面は描画だけを持つ。
//
// フッターの「戻る」が実処理を持たないのは3画面とも共通で、ドラッグ確定の時点で既に
// 永続化(ドラフトストア更新/DB書き込み)が済んでいるため。ボタン名もそれをそのまま表している
export function ExerciseReorderList<T extends ReorderableExercise>({
  rows,
  keyExtractor,
  setCountOf,
  onReorder,
  onMove,
  onPressBack,
}: Props<T>) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ReorderableList
        data={rows}
        onReorder={onReorder}
        renderItem={({ item, index }) => (
          <ReorderableExerciseRow
            exercise={item}
            setCount={setCountOf(item)}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onMoveUp={() => onMove(index, 'up')}
            onMoveDown={() => onMove(index, 'down')}
          />
        )}
        keyExtractor={keyExtractor}
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
        <PrimaryButton label="戻る" onPress={onPressBack} />
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
