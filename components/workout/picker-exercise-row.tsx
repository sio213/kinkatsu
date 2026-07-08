import { CategoryChip } from '@/components/exercises/category-chip';
import { Checkbox } from '@/components/ui/checkbox';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radio } from '@/components/ui/radio';
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
  // 種目追加ピッカー(複数選択)はチェックボックス、種目入れ替え(単一選択)はラジオボタンで
  // 選択方式が違うだけでレイアウトは共通のため、見た目の出し分けだけをpropsで持つ
  selectionMode?: 'checkbox' | 'radio';
};

export const PickerExerciseRow = memo(function PickerExerciseRow({
  exercise: e,
  selected,
  onToggle,
  onPressInfo,
  selectionMode = 'checkbox',
}: Props) {
  const images = getExerciseImages(e);
  const isRadio = selectionMode === 'radio';

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onToggle(e.id)}
      accessibilityRole={isRadio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${e.name}、${getCategoryLabel(e.category)}`}
    >
      {isRadio ? <Radio selected={selected} size={22} /> : <Checkbox checked={selected} size={22} />}
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
