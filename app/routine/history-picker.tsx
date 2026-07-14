import { DesignIcon } from '@/components/ui/design-icon';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { HistoryEntryCard } from '@/components/workout/history-entry-card';
import { Colors, Typography } from '@/constants/theme';
import { useExercise } from '@/hooks/use-exercises';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import {
  computePersonalBestIds,
  getExerciseHistoryEntries,
  hasAnyValue,
  NO_SESSION_TO_EXCLUDE,
  type HistoryEntry,
} from '@/lib/workout/history';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { formatSessionDateGroup, groupByMonth } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// app/workout/history-picker.tsxのルーティン版。「進行中セッション」の概念が無いため
// excludeSessionIdには除外不要を意味する番兵値を渡し、全ての実績を対象にする。
// 読み込み先もDB(loadHistoryIntoSessionExercise)ではなくuseRoutineDraftStoreの下書き配列
export default function RoutineHistoryPickerScreen() {
  const {
    index: indexParam,
    exerciseId: exerciseIdParam,
    exerciseName,
    hasRecordedData: hasRecordedDataParam,
  } = useLocalSearchParams<{
    index: string;
    exerciseId: string;
    exerciseName: string;
    hasRecordedData: string;
  }>();
  const index = Number(indexParam);
  const exerciseId = Number(exerciseIdParam);
  const hasRecordedData = hasRecordedDataParam === 'true';
  const router = useRouter();
  const { exercise } = useExercise(exerciseId);
  const loadSetsIntoExerciseAt = useRoutineDraftStore((state) => state.loadSetsIntoExerciseAt);
  // DBの非同期書き込みを伴うworkout版と違い、下書き配列への反映は同期的な1操作なので
  // ローディングスピナー表示は不要。連打だけ簡易に防ぐ
  const isLoadingRef = useRef(false);

  const measurementType = resolveMeasurementType(exercise?.measurementType);
  const columns = MEASUREMENT_COLUMNS[measurementType];

  const [entries, setEntries] = useState<HistoryEntry[] | 'error' | null>(null);
  const fetchEntries = useCallback(() => {
    if (!Number.isFinite(index) || !Number.isFinite(exerciseId)) return () => {};
    let cancelled = false;
    setEntries(null);
    getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((e) => {
        console.error('[exercise history]', e);
        if (!cancelled) setEntries('error');
      });
    return () => {
      cancelled = true;
    };
  }, [index, exerciseId]);
  useEffect(() => fetchEntries(), [fetchEntries]);

  const loadedEntries = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);
  const bestIds = useMemo(
    () => computePersonalBestIds(loadedEntries, measurementType),
    [loadedEntries, measurementType],
  );
  const sections = useMemo(
    () =>
      groupByMonth(loadedEntries).map((group) => ({
        title: group.monthLabel,
        data: group.items,
      })),
    [loadedEntries],
  );

  const runLoad = useCallback(
    (entry: HistoryEntry) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      // getExerciseHistoryEntriesはカード単位(✓確定セットが1件以上あるか)でしか絞り込まないため、
      // entry.setsには値が1つも無い行(セット追加だけして未入力のまま終えた等)が混ざりうる。
      // workout側のloadHistoryIntoSessionExercise/buildInitialRoutineSetsと同じくhasAnyValueで
      // 絞り込んでから読み込む(絞り込まないと余分な空セットがテンプレートに混入してしまう)
      const sets: DraftExercise['sets'] = entry.sets.filter(hasAnyValue).map((s) => ({
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
      }));
      loadSetsIntoExerciseAt(index, sets);
      router.back();
    },
    [index, loadSetsIntoExerciseAt, router],
  );

  const handleLoad = useCallback(
    (entry: HistoryEntry) => {
      // 既存セットに値が1つも入っていなければ失われるものが無く、確認なしで読み込んでよい
      // （種目入れ替え時の確認要否と同じ考え方）
      if (!hasRecordedData) {
        runLoad(entry);
        return;
      }
      const dateLabel = formatSessionDateGroup(entry.startedAt);
      Alert.alert(`${dateLabel}の記録を読み込みますか？`, '設定済みのセット内容は失われます。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '読み込む', style: 'destructive', onPress: () => runLoad(entry) },
      ]);
    },
    [hasRecordedData, runLoad],
  );

  if (!Number.isFinite(index) || !Number.isFinite(exerciseId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="種目が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="過去の記録から読み込み" subtitle={exerciseName} />,
        }}
      />
      {Array.isArray(entries) && entries.length > 0 && (
        <View style={styles.banner}>
          <DesignIcon name="assignment" size={16} color={Colors.accent} />
          <Text style={styles.bannerText}>
            選んだ日の記録が<Text style={styles.bannerTextBold}>現在のセットに置き換わります</Text>
          </Text>
        </View>
      )}

      {entries === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchEntries}
        />
      ) : Array.isArray(entries) && entries.length === 0 ? (
        <NotFoundState
          message="この種目の過去の記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.workoutSessionExerciseId)}
          renderItem={({ item }) => (
            <HistoryEntryCard
              entry={item}
              columns={columns}
              isBest={bestIds.has(item.workoutSessionExerciseId)}
              disabled={false}
              loading={false}
              onLoad={handleLoad}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthLabelWrapper}>
              <Text style={styles.monthLabel}>{section.title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, ...Typography.footnote, color: Colors.textMuted },
  bannerTextBold: { fontWeight: '700', color: Colors.textSecondary },

  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
});
