import { HeaderActionButton } from '@/components/ui/header-action-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SessionCard } from '@/components/workout/session-card';
import { Colors, Typography } from '@/constants/theme';
import type { WorkoutSession } from '@/db/schema';
import { useSessionStats, useWorkoutSessions } from '@/hooks/use-workout-session';
import { startWorkoutSession } from '@/lib/workout/session';
import { groupSessionsByDate } from '@/lib/workout/summary';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecordScreen() {
  const router = useRouter();
  const { sessions, activeSession } = useWorkoutSessions();
  const summaryBySession = useSessionStats();
  const isStartingRef = useRef(false);

  // 進行中セッションは履歴に出さず、開始/再開ボタンから直接遷移する対象にする
  const endedSessions = sessions.filter((s) => s.endedAt != null);
  const showHistory = !activeSession && endedSessions.length > 0;
  const sections = groupSessionsByDate(endedSessions).map((group) => ({
    title: group.dateLabel,
    data: group.sessions,
  }));

  const handleStart = useCallback(async () => {
    if (activeSession) {
      router.push(`/workout/${activeSession.id}`);
      return;
    }
    // 連打でstartSessionが二重に呼ばれ、endedAtがnullのセッションが2件できるのを防ぐ
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      const session = await startWorkoutSession();
      router.push(`/workout/${session.id}`);
    } catch (e) {
      console.error('[workout session start]', e);
      Alert.alert('エラー', 'トレーニングを開始できませんでした。');
    } finally {
      isStartingRef.current = false;
    }
  }, [activeSession, router]);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <Stack.Screen
        options={{
          headerRight: () =>
            showHistory ? (
              <HeaderActionButton
                icon="play.fill"
                label="開始"
                onPress={handleStart}
                accessibilityLabel="トレーニングを開始"
              />
            ) : null,
        }}
      />
      <View style={styles.container}>
        {activeSession ? (
          <TouchableOpacity
            style={styles.resumeBanner}
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="進行中のトレーニングを再開する"
          >
            <IconSymbol name="timer" size={18} color={Colors.accent} />
            <Text style={styles.resumeBannerText}>進行中のトレーニングを再開する</Text>
          </TouchableOpacity>
        ) : sessions.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="list.bullet.clipboard" size={40} color={Colors.borderStrong} />
            <Text style={styles.emptyText}>
              まだ記録がありません{'\n'}今日のトレーニングを記録して{'\n'}成長を積み上げていきましょう。
            </Text>
            <PrimaryButton
              label="＋ トレーニングを始める"
              onPress={handleStart}
              style={styles.startBtn}
            />
          </View>
        ) : null}

        {showHistory && (
          <SectionList
            style={styles.list}
            sections={sections}
            keyExtractor={(session) => String(session.id)}
            renderItem={({ item: session }: { item: WorkoutSession }) => (
              <SessionCard
                session={session}
                summary={summaryBySession.get(session.id) ?? { setCount: 0, totalVolume: 0 }}
              />
            )}
            renderSectionHeader={({ section }) => (
              <Text style={styles.dateLabel}>{section.title}</Text>
            )}
            ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
            SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
            contentContainerStyle={styles.scroll}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 16 },

  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    padding: 12,
  },
  resumeBannerText: { color: Colors.accent, ...Typography.bodyStrong },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  startBtn: {
    paddingHorizontal: 20,
    marginTop: 4,
  },

  list: { flex: 1, marginTop: 16 },
  scroll: { paddingBottom: 40 },
  dateLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, marginBottom: 8 },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
});
