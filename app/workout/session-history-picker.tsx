import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PastTrainingSessionCard } from '@/components/workout/past-training-session-card';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { CATEGORY_ALL, CATEGORY_ORDER, UNKNOWN_CATEGORY_ORDER } from '@/lib/exercises/constants';
import { getPastTrainingSessions, type PastTrainingSession } from '@/lib/workout/history';
import { dateGroupKey, groupByMonth } from '@/lib/workout/summary';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SessionHistoryPickerScreen() {
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);

  // null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）。history-picker.tsxと同じ三値管理
  const [sessions, setSessions] = useState<PastTrainingSession[] | 'error' | null>(null);
  const fetchSessions = useCallback(() => {
    if (!Number.isFinite(sessionId)) return () => {};
    let cancelled = false;
    setSessions(null);
    getPastTrainingSessions(sessionId)
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch((e) => {
        console.error('[past training sessions]', e);
        if (!cancelled) setSessions('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  useEffect(() => fetchSessions(), [fetchSessions]);

  const loadedSessions = useMemo(() => (Array.isArray(sessions) ? sessions : []), [sessions]);

  // 実際にこの一覧に含まれるカテゴリだけをチップとして出す（押しても0件になるだけのチップを避けるため）。
  // ★お気に入りは種目一覧・種目追加ピッカー専用の概念でこの画面には無関係なため含めない
  const categoryChips = useMemo(() => {
    const present = new Set<string>();
    for (const s of loadedSessions) {
      for (const e of s.exercises) present.add(e.category);
    }
    const sorted = Array.from(present).sort(
      (a, b) => (CATEGORY_ORDER[a] ?? UNKNOWN_CATEGORY_ORDER) - (CATEGORY_ORDER[b] ?? UNKNOWN_CATEGORY_ORDER),
    );
    return [CATEGORY_ALL, ...sorted];
  }, [loadedSessions]);

  const filteredSessions = useMemo(() => {
    if (activeCategory === CATEGORY_ALL) return loadedSessions;
    return loadedSessions.filter((s) => s.exercises.some((e) => e.category === activeCategory));
  }, [loadedSessions, activeCategory]);

  // getPastTrainingSessionsはカレンダー日ではなくセッション単位で返す仕様のため、同じ暦日に
  // 2回以上トレーニングしていると日付・カテゴリ・相対日付が同じカードが並びうる。
  // そのケースだけ開始時刻を補足表示して区別できるようにする（通常は1日1セッションのため増やさない）
  const duplicateDateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filteredSessions) {
      const key = dateGroupKey(s.startedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [filteredSessions]);

  const sections = useMemo(
    () => groupByMonth(filteredSessions).map((group) => ({ title: group.monthLabel, data: group.items })),
    [filteredSessions],
  );

  const handleSelect = useCallback(
    (session: PastTrainingSession) => {
      pushDebounced({
        pathname: '/workout/session-history-load',
        params: { sessionId: String(sessionId), sourceSessionId: String(session.sessionId) },
      });
    },
    [pushDebounced, sessionId],
  );

  if (!Number.isFinite(sessionId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {Array.isArray(sessions) && sessions.length > 0 && (
        <View style={styles.chipsWrap}>
          <CategoryFilterChips
            activeCategory={activeCategory}
            onChange={setActiveCategory}
            categories={categoryChips}
          />
        </View>
      )}

      {sessions === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      ) : sessions === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchSessions}
        />
      ) : sessions.length === 0 ? (
        <NotFoundState
          message="過去のトレーニング記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : filteredSessions.length === 0 ? (
        // categoryChipsは常にloadedSessionsの実データから作るため通常はここに到達しないが、
        // activeCategoryが選択された後にデータが変わり該当カテゴリが無くなるケースへの防御として残す
        <View style={styles.emptyWrapper}>
          <Text style={styles.empty}>該当する記録がありません</Text>
        </View>
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.sessionId)}
          renderItem={({ item }) => (
            <PastTrainingSessionCard
              session={item}
              onPress={handleSelect}
              showTime={duplicateDateKeys.has(dateGroupKey(item.startedAt))}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthLabelWrapper}>
              <Text style={styles.monthLabel}>{section.title}</Text>
            </View>
          )}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  chipsWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  empty: { color: Colors.textMuted, fontSize: 14 },

  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  // history-picker.tsxと同じ理由でスティッキーヘッダーの背面を不透明にする
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  sectionSeparator: { height: 16 },
});
