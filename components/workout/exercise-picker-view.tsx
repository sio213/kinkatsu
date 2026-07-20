import { ExerciseFilterHeader } from '@/components/exercises/exercise-filter-header';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { useExerciseUsageStats } from '@/hooks/use-exercise-usage-stats';
import { useExercises } from '@/hooks/use-exercises';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { CATEGORY_ALL } from '@/lib/exercises/constants';
import { filterExercises } from '@/lib/exercises/filter';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, View } from 'react-native';
import { PickerExerciseRow } from './picker-exercise-row';

type Props = {
  // トレーニング中セッションから開く場合、今まさに種目を追加している進行中セッションを
  // 実績集計から除外する（自分自身を「過去の実績」として参照しないため。詳細は
  // useExerciseUsageStatsのコメント参照）。ルーティン等セッションに紐づかない文脈では省略する
  excludeSessionId?: number;
  onPressInfo: (id: number) => void;
  // 選択を確定したときに呼ばれる。選択順を保持した種目idの配列を渡す
  // （呼び出し側がDB追加・ドラフトストアへの反映など、文脈ごとの確定処理を行う）。
  // このコンポーネントはawaitせずに呼ぶだけで、非同期処理のライフサイクル（連打防止・
  // エラー表示・完了後の遷移等）は全て呼び出し側の責務とする
  onConfirm: (selectedIds: number[]) => void | Promise<void>;
};

// 種目追加ピッカーの検索/カテゴリ絞り込み/並び替え/複数選択/確定ボタンの本体。
// app/workout/exercise-picker.tsx（トレーニング中セッションへの追加）とルーティンの
// 種目追加（下書きへの追加）の両方から使う共通ビュー。sessionId依存の確定処理
// （addExercisesToSession呼び出し等）は持たず、呼び出し側にonConfirmで委譲する
export function ExercisePickerView({ excludeSessionId, onPressInfo, onConfirm }: Props) {
  const { exercises } = useExercises();
  const usageStats = useExerciseUsageStats(excludeSessionId);
  const sortBy = useExerciseSortStore((state) => state.pickerSortBy);
  const setSortBy = useExerciseSortStore((state) => state.setPickerSortBy);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  // 選択順を保持するため配列で管理する（Setだと挿入順の保証が実装依存になるため避ける）
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const keyboardInset = useKeyboardInset();

  // 種目詳細等へ遷移してこの画面がフォーカスを失うタイミングでキーボードを閉じる。
  // 開いたままだと戻ってきたときに一覧が狭いままになってしまうため（exercises.tsxと同じ対応）
  useFocusEffect(
    useCallback(() => {
      return () => Keyboard.dismiss();
    }, []),
  );

  // 同じ種目を複数回追加できるユースケース（ウォームアップ→本セットを別カードで記録する等）を
  // 想定し、既に選択済み/追加済みの種目でも候補から除外しない
  const filtered = useMemo(
    () => filterExercises(exercises, activeCategory, search, { sortBy, usageStats }),
    [exercises, activeCategory, search, sortBy, usageStats],
  );

  const handleToggle = useCallback((id: number) => {
    // 選択したら検索キーボードを閉じ、画面下部の確定ボタンを隠れさせない
    Keyboard.dismiss();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existingId) => existingId !== id) : [...prev, id],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedIds.length === 0) return;
    onConfirm(selectedIds);
  }, [selectedIds, onConfirm]);

  const renderItem = useCallback(
    ({ item: e }: { item: Exercise }) => (
      <ListErrorBoundary>
        <PickerExerciseRow
          exercise={e}
          selected={selectedIds.includes(e.id)}
          onToggle={handleToggle}
          onPressInfo={onPressInfo}
        />
      </ListErrorBoundary>
    ),
    [selectedIds, handleToggle, onPressInfo],
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
    <>
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
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.footer}>
        <PrimaryButton
          label={selectedIds.length > 0 ? `${selectedIds.length}件を追加` : '追加'}
          onPress={handleConfirm}
          disabled={selectedIds.length === 0}
        />
      </View>
    </>
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
