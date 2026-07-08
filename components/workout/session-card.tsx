import { Colors, Typography } from '@/constants/theme';
import type { WorkoutSession } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import type { SessionSummary } from '@/lib/workout/summary';
import { formatSessionDuration } from '@/lib/workout/summary';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  session: WorkoutSession;
  summary: SessionSummary;
};

// タップすると/workout/[id]をそのセッションの記録編集画面として開く（endedAt済みのため
// 進行中画面と同じコンポーネントが「過去の記録」モードで表示される。分岐はapp/workout/[id].tsx側）
export const SessionCard = memo(function SessionCard({ session, summary }: Props) {
  const push = useDebouncedPush();
  const handlePress = useCallback(() => {
    push(`/workout/${session.id}`);
  }, [push, session.id]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="トレーニング記録を編集"
    >
      <View style={styles.content}>
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle}>トレーニング</Text>
          <Text style={styles.cardDuration}>
            {formatSessionDuration(session.startedAt, session.endedAt)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statChip}>
            <Text style={styles.statChipValue}>{summary.totalVolume}</Text>
            <Text style={styles.statChipLabel}> kg 総量</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipValue}>{summary.setCount}</Text>
            <Text style={styles.statChipLabel}> セット</Text>
          </View>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  content: { flex: 1, gap: 10 },
  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { ...Typography.cardTitle, color: Colors.textPrimary },
  cardDuration: { ...Typography.caption, color: Colors.textPlaceholder },
  statRow: { flexDirection: 'row', gap: 6 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statChipValue: { ...Typography.footnote, fontWeight: '700', color: Colors.textPrimary },
  statChipLabel: { ...Typography.caption, color: Colors.textMuted },
});
