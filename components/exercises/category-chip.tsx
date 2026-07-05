import { Colors } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { StyleSheet, Text, View } from 'react-native';

type Props = { category: string };

export function CategoryChip({ category }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{getCategoryLabel(category)}</Text>
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
  text: { fontSize: 11.5, color: Colors.accent, fontWeight: '600' },
});
