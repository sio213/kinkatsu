import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { summarizeCategories, type RoutineScheduleDisplay } from '@/lib/routines/format';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoutineCardMenu } from './routine-card-menu';

type Props = {
  name: string;
  exerciseCount: number;
  categories: string[];
  schedule: RoutineScheduleDisplay;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

export function RoutineCard({
  name,
  exerciseCount,
  categories,
  schedule,
  isFirst,
  isLast,
  onPress,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const { visible, overflowCount } = summarizeCategories(categories);

  // VoiceOver/TalkBackで名前・種目数・カテゴリ・スケジュールがバラバラに読み上げられないよう
  // カード全体を1つの読み上げ単位にまとめる（past-training-session-card.tsxと同じ考え方）
  const accessibilityLabel = [
    name,
    `${exerciseCount}種目`,
    categories.length > 0 ? categories.map(getCategoryLabel).join('・') : null,
    schedule.label,
  ]
    .filter(Boolean)
    .join('、');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.menuSlot}>
          <RoutineCardMenu
            isFirst={isFirst}
            isLast={isLast}
            onEdit={onEdit}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.exerciseCount}>{exerciseCount}種目</Text>
        {visible.map((category) => (
          <CategoryChip key={category} category={category} />
        ))}
        {overflowCount > 0 && <Text style={styles.overflow}>{`+${overflowCount}`}</Text>}
      </View>

      <View style={styles.sched}>
        <DesignIcon
          name={schedule.active ? 'calendar-today' : 'event-busy'}
          size={15}
          color={schedule.active ? Colors.accent : Colors.textPlaceholder}
        />
        <Text style={[styles.schedText, !schedule.active && styles.schedTextOff]}>{schedule.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary, flexShrink: 1 },
  menuSlot: { marginLeft: 'auto' },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  exerciseCount: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted },
  overflow: { ...Typography.caption, fontWeight: '700', color: Colors.textPlaceholder },

  sched: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  schedText: { ...Typography.footnote, fontWeight: '600', color: Colors.textBody },
  schedTextOff: { color: Colors.textPlaceholder },
});
