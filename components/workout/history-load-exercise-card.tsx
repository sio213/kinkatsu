import { CategoryChip } from '@/components/exercises/category-chip';
import { Checkbox } from '@/components/ui/checkbox';
import { Colors } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { formatHistorySetSummary, MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  card: SessionHistoryCard;
  selected: boolean;
  onToggle: (workoutSessionExerciseId: number) => void;
};

export const HistoryLoadExerciseCard = memo(function HistoryLoadExerciseCard({ card, selected, onToggle }: Props) {
  const images = getExerciseImages(card);
  const measurementType = resolveMeasurementType(card.measurementType);
  const summary = formatHistorySetSummary(MEASUREMENT_COLUMNS[measurementType], card.sets);

  const handlePress = () => onToggle(card.workoutSessionExerciseId);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${card.name}、${getCategoryLabel(card.category)}、${summary}`}
    >
      <Checkbox checked={selected} />
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {card.name}
          </Text>
          <CategoryChip category={card.category} />
        </View>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
      </View>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  summary: { fontSize: 12.5, color: Colors.textMuted },
});
