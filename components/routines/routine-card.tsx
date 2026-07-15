import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
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
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
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
  onStart,
  onEdit,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const { visible, overflowCount } = summarizeCategories(categories);

  // VoiceOver/TalkBackで名前・種目数・カテゴリ・スケジュールがバラバラに読み上げられないよう
  // カード全体を1つの読み上げ単位にまとめる（past-training-session-card.tsxと同じ考え方）
  const accessibilityLabel = [
    name,
    categories.length > 0 ? categories.map(getCategoryLabel).join('・') : null,
    `${exerciseCount}種目`,
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
      accessibilityHint="タップして編集画面を開きます"
    >
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.menuSlot}>
          <RoutineCardMenu
            isFirst={isFirst}
            isLast={isLast}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </View>
      </View>

      <View style={styles.meta}>
        {visible.map((category) => (
          <CategoryChip key={category} category={category} />
        ))}
        {overflowCount > 0 && <Text style={styles.overflow}>{`+${overflowCount}`}</Text>}
        <Text style={styles.exerciseCount}>{exerciseCount}種目</Text>
      </View>

      <View style={styles.sched}>
        <DesignIcon
          name={schedule.active ? 'calendar-today' : 'event-busy'}
          size={15}
          color={schedule.active ? Colors.accent : Colors.textPlaceholder}
        />
        <Text style={[styles.schedText, !schedule.active && styles.schedTextOff]}>{schedule.label}</Text>
      </View>

      <PrimaryButton
        label="開始"
        icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
        onPress={onStart}
        accessibilityLabel={`「${name}」のトレーニングを開始`}
        style={styles.startBtn}
      />
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
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  schedText: { ...Typography.footnote, fontWeight: '600', color: Colors.textBody },
  schedTextOff: { color: Colors.textPlaceholder },

  startBtn: { paddingVertical: 11 },
});
