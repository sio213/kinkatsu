import { chipStyles } from '@/components/exercises/chip-styles';
import { CATEGORY_FILTER_LIST, getCategoryLabel } from '@/lib/exercises/constants';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  activeCategory: string;
  onChange: (category: string) => void;
};

export function CategoryFilterChips({ activeCategory, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {CATEGORY_FILTER_LIST.map((cat) => {
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
