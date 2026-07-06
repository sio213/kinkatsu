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
  onSelect: (id: number) => void;
  onPressInfo: (id: number) => void;
};

// 入れ替え候補一覧の行。追加ピッカーのPickerExerciseRowと同じレイアウトだが、
// 単一選択のためチェックボックスの代わりにラジオボタンにする
export const SwapExerciseRow = memo(function SwapExerciseRow({
  exercise: e,
  selected,
  onSelect,
  onPressInfo,
}: Props) {
  const images = getExerciseImages(e);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onSelect(e.id)}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${e.name}、${getCategoryLabel(e.category)}`}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.accent },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: Colors.accent,
  },
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
