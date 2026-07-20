import { RoutineLoadExerciseCard } from '@/components/routines/routine-load-exercise-card';
import { CheckboxSelectHeader } from '@/components/ui/checkbox-select-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { LoadSubmitFooter } from '@/components/ui/load-submit-footer';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useCheckboxSelection } from '@/hooks/use-checkbox-selection';
import { addRoutineExercisesToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import { getRoutineDetail, type RoutineDetail } from '@/lib/routines/db';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「ルーティンから読み込む」フローの画面3。app/workout/routine-load.tsxのカレンダー版
// （2026-07-21新設）。選んだルーティンの種目をチェックボックスで選び、選んだものだけをこの予定へ
// 新規種目として追加する。構成はapp/workout/routine-load.tsxと同一（全選択・件数表示・確定ボタン）。
// トレーニング画面の「前回記録」ではなくルーティンの目標セットの値をそのままコピーする点、および
// completedAtの概念自体を持たない点が予定編集の文脈での違い
export default function ScheduleWorkoutRoutineLoadScreen() {
  const {
    scheduledWorkoutId: scheduledWorkoutIdParam,
    routineId: routineIdParam,
    routineName,
  } = useLocalSearchParams<{ scheduledWorkoutId: string; routineId: string; routineName: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const routineId = Number(routineIdParam);
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  // null=読み込み中、'error'=取得失敗、値=取得成功。app/workout/routine-load.tsxと同じ三値管理
  const [detail, setDetail] = useState<RoutineDetail | 'error' | null>(null);
  const fetchDetail = useCallback(() => {
    if (!Number.isFinite(scheduledWorkoutId) || !Number.isFinite(routineId)) return undefined;
    let cancelled = false;
    setDetail(null);
    getRoutineDetail(routineId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setDetail('error');
          return;
        }
        setDetail(data);
        // 初期状態は全選択（過去の記録から読み込む、と同じデザイン）
        selectAll(data.exercises.map((e) => e.id));
      })
      .catch((e) => {
        console.error('[routine detail fetch]', e);
        if (!cancelled) setDetail('error');
      });
    return () => {
      cancelled = true;
    };
    // selectAllはuseCheckboxSelectionが返す安定した参照のためdepsに含めなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledWorkoutId, routineId]);
  useEffect(() => fetchDetail(), [fetchDetail]);

  const exercises = useMemo(() => (detail && detail !== 'error' ? detail.exercises : []), [detail]);
  const exerciseIds = useMemo(() => exercises.map((e) => e.id), [exercises]);
  const { selectedIds, allSelected, toggle: handleToggle, toggleAll: handleToggleAll, selectAll } =
    useCheckboxSelection(exerciseIds);

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      // 表示順(orderIndex順)の並べ直しはaddRoutineExercisesToScheduledWorkout側
      // (detail.exercisesを絞り込む処理)が担うため、ここでは選んだidをそのまま渡せばよい
      const selections = Array.from(selectedIds).map((routineExerciseId) => ({ routineExerciseId }));
      await addRoutineExercisesToScheduledWorkout(scheduledWorkoutId, routineId, selections);
      // 画面3→画面2→種目編集画面の2階層を一度に閉じる(app/workout/routine-load.tsxと同じ)
      router.dismiss(2);
    } catch (e) {
      console.error('[add routine exercises to scheduled workout]', e);
      Alert.alert('エラー', '種目を読み込めませんでした。');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [selectedIds, scheduledWorkoutId, routineId, router]);

  const submitLabel = allSelected ? 'すべて読み込む' : `${selectedIds.size}種目を読み込む`;
  const hasExercises = exercises.length > 0;

  if (!Number.isFinite(scheduledWorkoutId) || !Number.isFinite(routineId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティン' }} />
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle title="このルーティンから読み込み" subtitle={routineName} /> }}
      />

      {hasExercises && (
        <CheckboxSelectHeader
          itemLabel="種目"
          selectedCount={selectedIds.size}
          totalCount={exercises.length}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
        />
      )}

      {detail === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      ) : detail === 'error' ? (
        <NotFoundState
          message="ルーティンを読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchDetail}
        />
      ) : exercises.length === 0 ? (
        <NotFoundState
          message="このルーティンには種目がありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <RoutineLoadExerciseCard exercise={item} selected={selectedIds.has(item.id)} onToggle={handleToggle} />
          )}
          contentContainerStyle={styles.content}
        />
      )}

      {hasExercises && (
        <LoadSubmitFooter label={submitLabel} onPress={handleSubmit} disabled={selectedIds.size === 0} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
});
