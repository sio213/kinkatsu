import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  category: string;
  // 「過去のトレーニングを選ぶ」画面で複数カテゴリの日を「胸ほか」のように表す時に使う
  suffix?: string;
};

export function CategoryChip({ category, suffix }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{`${getCategoryLabel(category)}${suffix ?? ''}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { ...Typography.caption, color: Colors.accent, fontWeight: '600' },
});
