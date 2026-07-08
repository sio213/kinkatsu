import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { pickPrimaryCategory, type PastTrainingSession } from '@/lib/workout/history';
import { formatRelativeDaysAgo, formatSessionDateGroup } from '@/lib/workout/summary';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  session: PastTrainingSession;
  onPress: (session: PastTrainingSession) => void;
};

export const PastTrainingSessionCard = memo(function PastTrainingSessionCard({
  session,
  onPress,
}: Props) {
  const dateLabel = formatSessionDateGroup(session.startedAt);
  const relativeLabel = formatRelativeDaysAgo(session.startedAt);

  const { primaryCategory, hasOtherCategories, exerciseNamesLabel } = useMemo(() => {
    const category = pickPrimaryCategory(session.exercises);
    const distinctCategories = new Set(session.exercises.map((e) => e.category));
    // 同じ種目が同日内に複数カード（ウォームアップ+本番等）あっても、一覧では種目名を重複表示しない
    const names = Array.from(new Set(session.exercises.map((e) => e.name)));
    return {
      primaryCategory: category,
      hasOtherCategories: distinctCategories.size > 1,
      exerciseNamesLabel: names.join('・'),
    };
  }, [session.exercises]);

  const handlePress = useCallback(() => onPress(session), [onPress, session]);

  // VoiceOver/TalkBackで日付・カテゴリ・相対日付・種目名がバラバラに読み上げられないよう
  // カード全体を1つの読み上げ単位にまとめる（history-entry-card.tsxと同じ考え方）
  const accessibilityLabel = [
    dateLabel,
    primaryCategory != null ? `${getCategoryLabel(primaryCategory)}${hasOtherCategories ? 'ほか' : ''}` : null,
    relativeLabel,
    exerciseNamesLabel,
  ]
    .filter(Boolean)
    .join('、');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.date}>{dateLabel}</Text>
          {primaryCategory != null && (
            <CategoryChip category={primaryCategory} suffix={hasOtherCategories ? 'ほか' : undefined} />
          )}
          {relativeLabel && <Text style={styles.relative}>{relativeLabel}</Text>}
        </View>
        <Text style={styles.exercises} numberOfLines={1}>
          {exerciseNamesLabel}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // session-card.tsx等の記録系カードと同じ箱型スタイルに統一
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: { flex: 1, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  date: { ...Typography.cardTitle, color: Colors.textPrimary },
  relative: { ...Typography.caption, color: Colors.textMuted },
  exercises: { ...Typography.footnote, color: Colors.textMuted },
  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
