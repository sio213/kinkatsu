import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { ExerciseSearchBar } from '@/components/exercises/exercise-search-bar';
import { ExerciseSortDropdown } from '@/components/exercises/exercise-sort-dropdown';
import { Colors } from '@/constants/theme';
import type { ExerciseSortBy } from '@/lib/exercises/constants';
import { StyleSheet, View } from 'react-native';

type Props = {
  search: string;
  onChangeSearch: (value: string) => void;
  onSubmitSearch?: () => void;
  activeCategory: string;
  onChangeCategory: (category: string) => void;
  sortBy: ExerciseSortBy;
  onChangeSortBy: (sortBy: ExerciseSortBy) => void;
};

// 種目一覧(app/(tabs)/exercises.tsx)・種目追加ピッカー(exercise-picker-view.tsx)・
// 種目入れ替えピッカー(exercise-swap-picker.tsx)で共有する検索+カテゴリ絞り込み+並び替えの
// ヘッダー。呼び出し側でFlatListのListHeaderComponentに渡し、stickyHeaderIndices={[0]}と
// 組み合わせてスクロールしても隠れない固定表示にする想定
export function ExerciseFilterHeader({
  search,
  onChangeSearch,
  onSubmitSearch,
  activeCategory,
  onChangeCategory,
  sortBy,
  onChangeSortBy,
}: Props) {
  return (
    <View style={styles.headerArea}>
      <ExerciseSearchBar value={search} onChangeText={onChangeSearch} onSubmitEditing={onSubmitSearch} />
      <CategoryFilterChips activeCategory={activeCategory} onChange={onChangeCategory} />
      <ExerciseSortDropdown sortBy={sortBy} onChange={onChangeSortBy} />
    </View>
  );
}

const styles = StyleSheet.create({
  // stickyHeaderIndices={[0]}で固定表示にされる前提。下からスクロールしてくる一覧が
  // 透けないよう不透明な背景色を持たせる。marginBottomは、ExerciseCard(枠線あり)が
  // 直下に来る種目一覧タブで余白が詰まって見えないようにするための調整（他の項目間隔と同じ8pt）
  headerArea: {
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 8,
    gap: 8,
    backgroundColor: Colors.background,
  },
});
