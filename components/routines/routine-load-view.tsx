import { RoutineLoadExerciseCard } from '@/components/routines/routine-load-exercise-card';
import { CheckboxSelectHeader } from '@/components/ui/checkbox-select-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { LoadSubmitFooter } from '@/components/ui/load-submit-footer';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useCheckboxSelection } from '@/hooks/use-checkbox-selection';
import { getRoutineDetail, type RoutineDetail, type RoutineExerciseSelection } from '@/lib/routines/db';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  routineId: number;
  routineName: string;
  // 選択が確定した時点で呼ばれる。実際の反映先(DBへの一括insert)・成功時の後処理
  // (通知・画面を閉じる)・失敗時のAlert表示は呼び出し側の責務とする
  // （components/workout/session-history-load-view.tsxと同じ設計）
  onSubmit: (selections: RoutineExerciseSelection[]) => Promise<void>;
};

// app/workout/routine-load.tsx・app/calendar/schedule-workout-routine-load.tsxの共通実装。
// 「選んだルーティンの種目をチェックボックスで選ぶ」という操作自体はどちらから開いても同じ体験の
// ため、取得・選択状態・見た目はここに一元化し、確定後の反映方法だけをonSubmitに委ねる
// （components/workout/session-history-load-view.tsxと同じ理由で共通化。2026-07-21、@reviewer指摘:
// 「現時点でこの画面を使うのはトレーニング画面からの経路のみ」という非共通化の前提が
// カレンダー予定側の2画面目追加で失効したため、事故った前例(addHistoryCardsToSessionの
// kind='new'バグを片方だけ直した)を繰り返さないよう切り出した）
export function RoutineLoadView({ routineId, routineName, onSubmit }: Props) {
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  // null=読み込み中、'error'=取得失敗、値=取得成功。session-history-load-view.tsxと同じ三値管理
  const [detail, setDetail] = useState<RoutineDetail | 'error' | null>(null);
  const fetchDetail = useCallback(() => {
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
  }, [routineId]);
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
      // 表示順(orderIndex順)の並べ直しはonSubmit側（呼び出し先のaddRoutineExercisesTo*が
      // detail.exercisesを絞り込む処理）が担うため、ここでは選んだidをそのまま渡せばよい
      const selections = Array.from(selectedIds).map((routineExerciseId) => ({ routineExerciseId }));
      await onSubmit(selections);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [selectedIds, onSubmit]);

  const submitLabel = allSelected ? 'すべて読み込む' : `${selectedIds.size}種目を読み込む`;
  const hasExercises = exercises.length > 0;

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
