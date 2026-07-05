import { Colors } from '@/constants/theme';
import type { WorkoutSession } from '@/db/schema';
import type { SessionSummary } from '@/lib/workout/summary';
import { formatSessionDuration } from '@/lib/workout/summary';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  session: WorkoutSession;
  summary: SessionSummary;
};

export const SessionCard = memo(function SessionCard({ session, summary }: Props) {
  return (
    <View style={styles.card}>
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
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
  cardDuration: { fontSize: 11, color: Colors.textPlaceholder },
  statRow: { flexDirection: 'row', gap: 6 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statChipValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
  statChipLabel: { fontSize: 11, color: Colors.textMuted },
});
