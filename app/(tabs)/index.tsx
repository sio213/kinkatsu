import { HeaderActionButton } from '@/components/ui/header-action-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ResumeWorkoutBanner } from '@/components/workout/resume-workout-banner';
import { SessionCard } from '@/components/workout/session-card';
import { Colors, Typography } from '@/constants/theme';
import type { WorkoutSession } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useSessionStats, useWorkoutSessions } from '@/hooks/use-workout-session';
import { groupSessionsByDate } from '@/lib/workout/summary';
import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecordScreen() {
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { sessions, activeSession } = useWorkoutSessions();
  const summaryBySession = useSessionStats();

  // 進行中セッションは履歴に出さず、開始/再開ボタンから直接遷移する対象にする
  const endedSessions = sessions.filter((s) => s.endedAt != null);
  const showHistory = !activeSession && endedSessions.length > 0;
  const sections = groupSessionsByDate(endedSessions).map((group) => ({
    title: group.dateLabel,
    data: group.sessions,
  }));

  // このボタン自体が「開始/再開」を兼ねるため、進行中セッションがあれば無条件でそちらへ合流する
  // (ルーティン一覧のカードタップと違い、ここでは「進行中のトレーニングへ戻る」ことが期待される
  // 挙動そのものなので確認は挟まない)。進行中セッションが無い場合は、カレンダーの「今日・記録なし」
  // パネルと同じ開始方法選択画面(start-chooser)を経由させる（2026-07-20、要件確認済み。
  // 以前はここで直接startWorkoutSessionを呼び空セッションへ即遷移していたが、
  // 「自分で選ぶ/ルーティン/おすすめメニュー/履歴から」の選択機会が無いまま開始されてしまっていた）。
  // カレンダーの同じ遷移先を持つhandleStartToday(app/(tabs)/calendar.tsx)と揃え、
  // pushDebouncedで連打によるstart-chooserの二重pushを防ぐ（@tester指摘）
  const handleStart = useCallback(() => {
    if (activeSession) {
      pushDebounced(`/workout/${activeSession.id}`);
      return;
    }
    pushDebounced('/workout/start-chooser');
  }, [activeSession, pushDebounced]);

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
        {/* ルーティン一覧への暫定の橋渡し。タブ構成にルーティン専用の入り口が無いため、
            本実装(専用タブ等)ができるまでのつなぎとしてここに置く */}
        <TouchableOpacity
          style={styles.routineLinkBanner}
          onPress={() => router.push('/routine')}
          accessibilityRole="button"
          accessibilityLabel="ルーティン一覧を見る"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="dumbbell.fill" size={16} color={Colors.textBody} />
          <Text style={styles.routineLinkBannerText}>ルーティン一覧</Text>
          <IconSymbol name="chevron.right" size={14} color={Colors.textPlaceholder} />
        </TouchableOpacity>

        {activeSession ? (
          <ResumeWorkoutBanner onPress={handleStart} />
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

  routineLinkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 12,
  },
  routineLinkBannerText: { ...Typography.footnote, fontWeight: '600', color: Colors.textBody },

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
