import { DesignIcon } from '@/components/ui/design-icon';
import { NotFoundState } from '@/components/ui/not-found-state';
import { HistoryEntryCard } from '@/components/workout/history-entry-card';
import { Colors } from '@/constants/theme';
import { useExercise } from '@/hooks/use-exercises';
import { MEASUREMENT_TYPES, type MeasurementType } from '@/lib/exercises/constants';
import { computePersonalBestIds, getExerciseHistoryEntries, type HistoryEntry } from '@/lib/workout/history';
import { notifyHistoryLoaded } from '@/lib/workout/history-load-feedback';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { loadHistoryIntoSessionExercise } from '@/lib/workout/session';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { formatShortDate, groupByMonth } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HistoryPickerScreen() {
  const {
    sessionId: sessionIdParam,
    sessionExerciseId: sessionExerciseIdParam,
    exerciseId: exerciseIdParam,
    exerciseName,
  } = useLocalSearchParams<{
    sessionId: string;
    sessionExerciseId: string;
    exerciseId: string;
    exerciseName: string;
  }>();
  const sessionId = Number(sessionIdParam);
  const sessionExerciseId = Number(sessionExerciseIdParam);
  const exerciseId = Number(exerciseIdParam);
  const router = useRouter();
  const { exercise } = useExercise(exerciseId);
  const isLoadingRef = useRef(false);
  // 読み込み中のカードだけボタンを無効化するため、真偽値ではなく対象カードのidで持つ
  // （真偽値だと押していない他のカードまで一律グレーアウトし、どれを押したか分からなくなるため）
  const [loadingCardId, setLoadingCardId] = useState<number | null>(null);

  // 未知のmeasurementType（想定外のDB値）でも画面ごとクラッシュさせず標準の重量×回数にフォールバックする
  // （session-exercise-card.tsxと同じ理由）
  const measurementType: MeasurementType =
    exercise && (MEASUREMENT_TYPES as readonly string[]).includes(exercise.measurementType)
      ? (exercise.measurementType as MeasurementType)
      : 'weight_reps';
  const columns = MEASUREMENT_COLUMNS[measurementType];

  // null=読み込み中、'error'=取得失敗（「記録が無い」と区別してAlertを出す）、配列=取得成功（0件含む）
  const [entries, setEntries] = useState<HistoryEntry[] | 'error' | null>(null);
  const fetchEntries = useCallback(() => {
    if (!Number.isFinite(exerciseId) || !Number.isFinite(sessionId)) return () => {};
    let cancelled = false;
    setEntries(null);
    getExerciseHistoryEntries(exerciseId, sessionId)
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
  }, [exerciseId, sessionId]);
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

  const handleLoad = useCallback(
    async (entry: HistoryEntry) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setLoadingCardId(entry.workoutSessionExerciseId);
      try {
        const { prefilledSetIds, previousSnapshot } = await loadHistoryIntoSessionExercise(
          sessionExerciseId,
          entry.workoutSessionExerciseId,
        );
        notifyPrefilled([{ sessionId, exerciseId, sessionExerciseId, kind: 'history', prefilledSetIds }]);
        notifyHistoryLoaded({
          sessionId,
          sessionExerciseId,
          dateLabel: formatShortDate(entry.startedAt),
          previousSnapshot,
        });
        router.back();
      } catch (e) {
        console.error('[load history into session exercise]', e);
        Alert.alert('エラー', '記録を読み込めませんでした。');
      } finally {
        isLoadingRef.current = false;
        setLoadingCardId(null);
      }
    },
    [sessionId, sessionExerciseId, exerciseId, router],
  );

  if (!Number.isFinite(sessionExerciseId) || !Number.isFinite(exerciseId)) {
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
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>記録から読み込む</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {exerciseName}
              </Text>
            </View>
          ),
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
              disabled={loadingCardId != null}
              loading={loadingCardId === item.workoutSessionExerciseId}
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

  headerTitleWrap: { alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentSurface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, fontSize: 12.5, color: Colors.textMuted },
  bannerTextBold: { fontWeight: '700', color: Colors.textSecondary },

  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  // スクロール中はスティッキーヘッダーとして画面上部に固定表示される。marginHorizontalで
  // contentの左右paddingを打ち消して画面端まで塗りつぶすことで、背面のカードが透けて
  // 文字と重なって見えないようにする（背景を不透明にするのが目的で、marginBottom分は
  // paddingBottomに置き換えている）
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
});
