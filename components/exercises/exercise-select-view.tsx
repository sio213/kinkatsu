import { ExerciseFilterHeader } from '@/components/exercises/exercise-filter-header';
import { KeyboardAvoidingScreen } from '@/components/ui/keyboard-avoiding-screen';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { PickerExerciseRow } from '@/components/workout/picker-exercise-row';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExerciseUsageStats } from '@/hooks/use-exercise-usage-stats';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';

type Props = {
  // 絞り込み前の全種目。ここで自前にuseExercisesを呼ばないのは、ExerciseSwapPickerが確定時に
  // exercises.findで種目を引く必要があり、内部でも呼ぶと同じ画面でlive queryの購読が
  // 二重になるため。呼び出し側で1回だけ取得して渡してもらう
  exercises: Exercise[];
  // 並び替え軸の保存先。種目追加ピッカーと種目入れ替えでは選択中の軸を独立して保持する
  // (lib/exercises/sort-store.tsを参照)
  sortScope: 'picker' | 'swap';
  // 実績集計から除外するセッション(呼び出し時点で編集中のセッション)。ルーティン編集には
  // セッションの概念が無いため、その場合はundefinedのまま渡す(除外対象なし)
  usageStatsExcludeSessionId?: number;
  // 候補から常に除外する種目。種目入れ替えで「現在の種目」を選んでも差分が無いため使う
  excludeExerciseId?: number;
  // 選択中の種目id。単一選択(入れ替え)の場合も0件か1件の配列として渡す
  selectedIds: number[];
  selectionMode?: 'checkbox' | 'radio';
  onToggle: (id: number) => void;
  // 確定ボタンを含むフッター。ラベル・活性条件・押したときの処理が呼び出し元ごとに違うため、
  // このコンポーネントは配置だけを担い中身は受け取る
  footer: ReactNode;
};

// 種目を検索・絞り込み・並び替えしながら選ぶリストの本体。
// ExercisePickerView(複数選択して追加)とExerciseSwapPicker(単一選択して入れ替え)が
// 検索/カテゴリ絞り込み/並び替え/一覧/空状態/キーボード制御を丸ごと同じ形で持っていたため
// 共通化した。選択状態そのものと確定処理は呼び出し側が持ち、ここは「選ばせる」ことだけを担う。
//
// 種目一覧タブ(app/(tabs)/(library)/exercises/index.tsx)も同じExerciseFilterHeaderを使うが、
// あちらは選択ではなく閲覧の画面で、行(ExerciseCard)・空状態(種目の新規作成導線を含む)・
// キーボード対応(固定フッターが無いためuseKeyboardInset)がいずれも異なるため統合していない
export function ExerciseSelectView({
  exercises,
  sortScope,
  usageStatsExcludeSessionId,
  excludeExerciseId,
  selectedIds,
  selectionMode = 'checkbox',
  onToggle,
  footer,
}: Props) {
  const pushDebounced = useDebouncedPush();
  const usageStats = useExerciseUsageStats(usageStatsExcludeSessionId);
  const sortBy = useExerciseSortStore((state) => (sortScope === 'picker' ? state.pickerSortBy : state.swapSortBy));
  const setSortBy = useExerciseSortStore((state) =>
    sortScope === 'picker' ? state.setPickerSortBy : state.setSwapSortBy,
  );

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);

  // 種目詳細等へ遷移してこの画面がフォーカスを失うタイミングでキーボードを閉じる。
  // 開いたままだと戻ってきたときに一覧が狭いままになってしまうため（exercises.tsxと同じ対応）
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  // 同じ種目を複数回追加できるユースケース（ウォームアップ→本セットを別カードで記録する等）を
  // 想定し、既に選択済み/追加済みの種目でも候補から除外しない。
  // excludeExerciseIdだけは「選んでも差分が無い」ため常に除く
  const filtered = useMemo(() => {
    const result = filterExercises(exercises, activeCategory, search, { sortBy, usageStats });
    return excludeExerciseId == null ? result : result.filter((e) => e.id !== excludeExerciseId);
  }, [exercises, activeCategory, search, sortBy, usageStats, excludeExerciseId]);

  // 種目詳細へは全ての呼び出し元が同じ遷移をするため、ここで完結させる
  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <PickerExerciseRow
          exercise={e}
          selected={selectedIds.includes(e.id)}
          onToggle={onToggle}
          onPressInfo={handlePressInfo}
          selectionMode={selectionMode}
        />
      </ListErrorBoundary>
    ),
    [selectedIds, onToggle, handlePressInfo, selectionMode],
  );

  const listHeader = (
    <ExerciseFilterHeader
      search={search}
      onChangeSearch={setSearch}
      onSubmitSearch={Keyboard.dismiss}
      activeCategory={activeCategory}
      onChangeCategory={setActiveCategory}
      sortBy={sortBy}
      onChangeSortBy={setSortBy}
    />
  );

  const trimmedSearch = search.trim();
  const emptyComponent = (
    <View style={styles.emptyWrapper}>
      <Text style={styles.empty}>
        {trimmedSearch ? `「${trimmedSearch}」は見つかりません` : '該当する種目がありません'}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingScreen>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        // 検索・カテゴリ絞り込み・並び替えをスクロールしても隠れないよう先頭(index 0)で固定する
        stickyHeaderIndices={[0]}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.footer}>{footer}</View>
    </KeyboardAvoidingScreen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },

  emptyWrapper: { alignItems: 'center', paddingVertical: 32 },
  empty: { color: Colors.textMuted, ...Typography.body, textAlign: 'center' },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
