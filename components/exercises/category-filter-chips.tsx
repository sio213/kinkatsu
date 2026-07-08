import { chipStyles } from '@/components/exercises/chip-styles';
import { CATEGORY_FILTER_LIST, getCategoryLabel } from '@/lib/exercises/constants';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  activeCategory: string;
  onChange: (category: string) => void;
  // 種目一覧・種目追加ピッカーは固定のCATEGORY_FILTER_LIST（全て/★お気に入り/全カテゴリ）を使うが、
  // 「過去のトレーニングを選ぶ」画面のように★お気に入りが無意味だったり、実際にデータが
  // 存在するカテゴリだけに絞りたい場面向けに差し替え可能にする
  categories?: readonly string[];
};

export function CategoryFilterChips({ activeCategory, onChange, categories = CATEGORY_FILTER_LIST }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        const label = getCategoryLabel(cat);
        return (
          <TouchableOpacity
            key={cat}
            style={[chipStyles.chip, isActive && chipStyles.chipActive]}
            onPress={() => onChange(cat)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={label}
          >
            <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 6 },
});
