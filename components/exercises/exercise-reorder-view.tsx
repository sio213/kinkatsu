import { ReorderableExerciseRow, type ReorderableExercise } from '@/components/exercises/reorderable-exercise-row';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import ReorderableList, { type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props<T extends ReorderableExercise> = {
  rows: T[];
  // 行を一意に識別できる値。並び替えのたびに変わる配列indexは使えないため呼び出し側で用意する
  // (何を一意なキーにできるかはドメインごとに違う。ルーティン下書き特有の事情は
  // app/routine/exercise-reorder.tsxのコメントを参照)
  keyExtractor: (row: T) => string;
  // セット数の求め方が呼び出し元で異なる(行に同梱されている/別のlive queryから引く)ため関数で受ける
  setCountOf: (row: T) => number;
  onReorder: (event: ReorderableListReorderEvent) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onPressBack: () => void;
};

// 「種目まとめて並び替え」画面の本体。app/routine/exercise-reorder.tsx(ルーティン下書き)・
// app/workout/exercise-reorder.tsx(トレーニング中セッション)・
// app/calendar/schedule-workout-exercise-reorder.tsx(カレンダーの予定)の3画面が同じ描画を
// 持つに至ったため共通化した。並び順の状態管理・永続化はhooks/use-reorderable-rows.tsが担う。
//
// リストだけでなくSafeAreaView・固定フッターまで含む画面本体なので、純粋なリストである
// RoutinePickerList(components/routines/routine-picker-list.tsx)ではなく、同じく画面本体を
// 共通化しているRoutineLoadView・SessionHistoryPickerViewに倣って*-view.tsxとしている
// (@reviewer指摘: *Listという名前で画面のchromeまで持つと読み手の期待とずれるため)。
// 3画面ともフッターまで完全に一致しており、chromeごと共通化する価値がある。
//
// フッターの「戻る」が実処理を持たないのは3画面とも共通で、ドラッグ確定の時点で既に
// 永続化(ドラフトストア更新/DB書き込み)が済んでいるため。ボタン名もそれをそのまま表している
export function ExerciseReorderView<T extends ReorderableExercise>({
  rows,
  keyExtractor,
  setCountOf,
  onReorder,
  onMove,
  onPressBack,
}: Props<T>) {
  const renderItem = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <ReorderableExerciseRow
        exercise={item}
        setCount={setCountOf(item)}
        isFirst={index === 0}
        isLast={index === rows.length - 1}
        onMoveUp={() => onMove(index, 'up')}
        onMoveDown={() => onMove(index, 'down')}
      />
    ),
    [rows.length, setCountOf, onMove],
  );

  return (
    // 並び替えはCLAUDE.mdの分類でいう「フロー内の中間画面」で、3画面ともタブバーを隠す
    // ルートStack上にあるためedgesは['bottom']で固定してよい。将来タブ配下に置く並び替え画面が
    // 増えた場合は、タブバーが下端を占有するのでedges={[]}が必要になる(その時点でpropへ外出しする)
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ReorderableList
        data={rows}
        onReorder={onReorder}
        renderItem={renderItem}
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
