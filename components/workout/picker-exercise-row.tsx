import { CategoryChip } from '@/components/exercises/category-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: Exercise;
  selected: boolean;
  onToggle: (id: number) => void;
  onPressInfo: (id: number) => void;
};

export const PickerExerciseRow = memo(function PickerExerciseRow({
  exercise: e,
  selected,
  onToggle,
  onPressInfo,
}: Props) {
  const images = getExerciseImages(e);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onToggle(e.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${e.name}、${getCategoryLabel(e.category)}`}
    >
      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
        {selected && <IconSymbol name="checkmark" size={14} color={Colors.onAccent} />}
      </View>
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {e.name}
        </Text>
        <CategoryChip category={e.category} />
      </View>
      <TouchableOpacity
        onPress={() => onPressInfo(e.id)}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel={`${e.name}の詳細を見る`}
      >
        <IconSymbol name="info.circle" size={20} color={Colors.textPlaceholder} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
