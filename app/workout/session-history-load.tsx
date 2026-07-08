import { Checkbox } from '@/components/ui/checkbox';
import { DesignIcon } from '@/components/ui/design-icon';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { HistoryLoadExerciseCard } from '@/components/workout/history-load-exercise-card';
import { Colors } from '@/constants/theme';
import { getSessionExerciseCards, type SessionHistoryCard } from '@/lib/workout/history';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addHistoryCardsToSession } from '@/lib/workout/session';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SessionHistoryLoadScreen() {
  const {
    sessionId: sessionIdParam,
    sourceSessionId: sourceSessionIdParam,
    sourceStartedAt: sourceStartedAtParam,
  } = useLocalSearchParams<{ sessionId: string; sourceSessionId: string; sourceStartedAt: string }>();
  const sessionId = Number(sessionIdParam);
  const sourceSessionId = Number(sourceSessionIdParam);
  const sourceStartedAt = Number(sourceStartedAtParam);
  const router = useRouter();
  const isLoadingRef = useRef(false);

  // null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）。history-picker.tsxと同じ三値管理
  const [cards, setCards] = useState<SessionHistoryCard[] | 'error' | null>(null);
  const fetchCards = useCallback(() => {
    if (!Number.isFinite(sessionId) || !Number.isFinite(sourceSessionId)) return () => {};
    let cancelled = false;
    setCards(null);
    getSessionExerciseCards(sourceSessionId)
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          // 初期状態は全選択（デザイン通り）
          setSelectedIds(new Set(data.map((c) => c.workoutSessionExerciseId)));
        }
      })
      .catch((e) => {
        console.error('[session exercise cards]', e);
        if (!cancelled) setCards('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sourceSessionId]);
  useEffect(() => fetchCards(), [fetchCards]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const loadedCards = useMemo(() => (Array.isArray(cards) ? cards : []), [cards]);
  const allSelected = loadedCards.length > 0 && selectedIds.size === loadedCards.length;

  const handleToggle = useCallback((workoutSessionExerciseId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workoutSessionExerciseId)) {
        next.delete(workoutSessionExerciseId);
      } else {
        next.add(workoutSessionExerciseId);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === loadedCards.length ? new Set() : new Set(loadedCards.map((c) => c.workoutSessionExerciseId)),
    );
  }, [loadedCards]);

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      // loadedCards（orderIndex順）をfilterすることで、一部だけ選択してもselectionsの並びが
      // クリック順ではなく元セッションの表示順のまま保たれる（selectedIdsはSetのため挿入順に頼らない）
      const selections = loadedCards
        .filter((c) => selectedIds.has(c.workoutSessionExerciseId))
        .map((c) => ({ exerciseId: c.exerciseId, sourceWorkoutSessionExerciseId: c.workoutSessionExerciseId }));
      const prefilled = await addHistoryCardsToSession(sessionId, selections);
      notifyPrefilled(prefilled);
      // 画面3→画面2→トレーニング画面の2階層を一度に閉じる。この画面への遷移経路が
      // 「トレーニング画面→画面2→画面3」の1本しか無い前提に依存するため、将来ディープリンク等
      // 別経路が増える場合はこの固定値を見直すこと
      router.dismiss(2);
    } catch (e) {
      console.error('[add history cards to session]', e);
      Alert.alert('エラー', '種目を読み込めませんでした。');
    } finally {
      isLoadingRef.current = false;
    }
  }, [selectedIds, sessionId, loadedCards, router]);

  const dateLabel = Number.isFinite(sourceStartedAt) ? formatSessionDateGroup(sourceStartedAt) : '';
  const submitLabel = allSelected ? 'すべて読み込む' : `${selectedIds.size}種目を読み込む`;
  const hasCards = Array.isArray(cards) && cards.length > 0;

  if (!Number.isFinite(sessionId) || !Number.isFinite(sourceSessionId)) {
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
      <Stack.Screen options={{ title: dateLabel }} />

      {hasCards && (
        <View style={styles.header}>
          <Text style={styles.headerCount}>
            読み込む種目 <Text style={styles.headerCountValue}>{`${selectedIds.size} / ${loadedCards.length}`}</Text>
          </Text>
          <TouchableOpacity
            style={styles.selectAll}
            onPress={handleToggleAll}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            accessibilityLabel="全選択"
          >
            <Checkbox checked={allSelected} />
            <Text style={styles.selectAllText}>全選択</Text>
          </TouchableOpacity>
        </View>
      )}

      {cards === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      ) : cards === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchCards}
        />
      ) : cards.length === 0 ? (
        <NotFoundState
          message="この日の記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={cards}
          keyExtractor={(item) => String(item.workoutSessionExerciseId)}
          renderItem={({ item }) => (
            <HistoryLoadExerciseCard
              card={item}
              selected={selectedIds.has(item.workoutSessionExerciseId)}
              onToggle={handleToggle}
            />
          )}
          contentContainerStyle={styles.content}
        />
      )}

      {hasCards && (
        <View style={styles.footer}>
          <PrimaryButton
            label={submitLabel}
            onPress={handleSubmit}
            disabled={selectedIds.size === 0}
            icon={<DesignIcon name="download" size={16} color={Colors.onAccent} />}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCount: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  headerCountValue: { color: Colors.text },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  selectAllText: { fontSize: 12.5, fontWeight: '700', color: Colors.accent },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
