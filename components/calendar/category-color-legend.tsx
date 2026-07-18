import { Colors, Typography } from '@/constants/theme';
import { CALENDAR_COLOR_LEGEND } from '@/lib/calendar/category-color';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// カテゴリ色の凡例。7色を1行に収め、はみ出た分はCategoryFilterChipsと同様に横スクロールする
// （タップでの絞り込みは行わない非インタラクティブな色キーのため、チップ型のタップ可能な
// 見た目とは区別し、ドット+ラベルの並びのみにしている）
export function CategoryColorLegend() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {CALENDAR_COLOR_LEGEND.map((entry) => (
        <View key={entry.group} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: entry.color }]} />
          <Text style={styles.label}>{entry.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 12, alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  label: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted },
});
