import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import {
  formatSessionDuration,
  groupSessionsByDate,
  summarizeSetsBySession,
} from '@/lib/workout/summary';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecordScreen() {
  const router = useRouter();
  const { sessions, activeSession, sets, startSession } = useWorkoutSessions();

  // 進行中セッションは履歴に出さず、開始/再開ボタンから直接遷移する対象にする
  const endedSessions = sessions.filter((s) => s.endedAt != null);
  const summaryBySession = summarizeSetsBySession(sets);
  const dateGroups = groupSessionsByDate(endedSessions);

  const handleStart = useCallback(async () => {
    if (activeSession) {
      router.push(`/workout/${activeSession.id}`);
      return;
    }
    try {
      const session = await startSession();
      router.push(`/workout/${session.id}`);
    } catch (e) {
      console.error('[workout session start]', e);
      Alert.alert('エラー', 'トレーニングを開始できませんでした。');
    }
  }, [activeSession, router, startSession]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>記録</Text>
          {endedSessions.length > 0 && (
            <TouchableOpacity style={styles.addBtn} onPress={handleStart}>
              <Text style={styles.addBtnText}>＋ 追加</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeSession && (
          <TouchableOpacity style={styles.resumeBanner} onPress={handleStart}>
            <IconSymbol name="timer" size={18} color={Colors.accent} />
            <Text style={styles.resumeBannerText}>進行中のトレーニングを再開する</Text>
          </TouchableOpacity>
        )}

        {endedSessions.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="list.bullet.clipboard" size={40} color={Colors.borderStrong} />
            <Text style={styles.emptyText}>
              まだ記録がありません{'\n'}今日のトレーニングを記録して{'\n'}成長を積み上げていきましょう。
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
              <Text style={styles.startBtnText}>＋ トレーニングを始める</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {dateGroups.map((group) => (
              <View key={group.dateLabel} style={styles.dateGroup}>
                <Text style={styles.dateLabel}>{group.dateLabel}</Text>
                {group.sessions.map((session) => {
                  const summary = summaryBySession.get(session.id) ?? {
                    setCount: 0,
                    totalVolume: 0,
                  };
                  return (
                    <View key={session.id} style={styles.card}>
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
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 16 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },

  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  resumeBannerText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textPlaceholder, textAlign: 'center', lineHeight: 20 },
  startBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop: 4,
  },
  startBtnText: { color: Colors.onAccent, fontWeight: '600', fontSize: 14 },

  scroll: { paddingTop: 16, paddingBottom: 40, gap: 16 },
  dateGroup: { gap: 8 },
  dateLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
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
