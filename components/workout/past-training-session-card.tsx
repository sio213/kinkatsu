import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { pickPrimaryCategory, type PastTrainingSession } from '@/lib/workout/history';
import { formatRelativeDaysAgo, formatSessionDateGroup, formatSessionTime } from '@/lib/workout/summary';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  session: PastTrainingSession;
  onPress: (session: PastTrainingSession) => void;
  // 同じ暦日に複数セッションがあり日付だけでは区別できない場合に開始時刻を補足表示する
  // （getPastTrainingSessionsはカレンダー日ではなくセッション単位で返すため起こりうる）
  showTime?: boolean;
};

export const PastTrainingSessionCard = memo(function PastTrainingSessionCard({
  session,
  onPress,
  showTime = false,
}: Props) {
  const dateLabel = formatSessionDateGroup(session.startedAt);
  const relativeLabel = formatRelativeDaysAgo(session.startedAt);
  const timeLabel = showTime ? formatSessionTime(session.startedAt) : null;

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
    timeLabel,
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
          {timeLabel && <Text style={styles.time}>{timeLabel}</Text>}
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
  // デザイン画像はカードの箱（背景・枠線）ではなく、行間を細いディバイダーで区切るフラットな
  // リストのため、他の一覧カード（session-card.tsx等）とは異なりPickerExerciseRowに近いスタイルにする
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: { flex: 1, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  date: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  time: { fontSize: 11.5, color: Colors.textMuted },
  relative: { fontSize: 11.5, color: Colors.textMuted },
  exercises: { fontSize: 12.5, color: Colors.textMuted },
  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
