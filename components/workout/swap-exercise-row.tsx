import { CategoryChip } from '@/components/exercises/category-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: Exercise;
  onPress: (exercise: Exercise) => void;
  onPressInfo: (id: number) => void;
};

// 入れ替え候補一覧の行。追加ピッカーのPickerExerciseRowと違い複数選択ではなく
// 単一選択・タップ即確定のため、チェックボックスは持たずchevronで即決定を示す
export const SwapExerciseRow = memo(function SwapExerciseRow({ exercise: e, onPress, onPressInfo }: Props) {
  const images = getExerciseImages(e);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(e)}
      accessibilityRole="button"
      accessibilityLabel={`${e.name}に入れ替える`}
    >
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
      <IconSymbol name="chevron.right" size={16} color={Colors.textPlaceholder} />
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
