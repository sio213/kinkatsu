import { RoutineLoadExerciseCard } from '@/components/routines/routine-load-exercise-card';
import { CheckboxSelectHeader } from '@/components/ui/checkbox-select-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { LoadSubmitFooter } from '@/components/ui/load-submit-footer';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useCheckboxSelection } from '@/hooks/use-checkbox-selection';
import { getRoutineDetail, type RoutineDetail } from '@/lib/routines/db';
import { notifyPrefilled } from '@/lib/workout/prefill-feedback';
import { addRoutineExercisesToSession } from '@/lib/workout/session';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」フローの画面3。選んだルーティンの種目を
// チェックボックスで選び、選んだものだけを既存セッションへ新規カードとして追加する。構成は
// components/workout/session-history-load-view.tsxと同じ（全選択・件数表示・確定ボタン）で、
// 選択状態・ヘッダー行・フッターは共通化済み(hooks/use-checkbox-selection.ts・
// components/ui/checkbox-select-header.tsx・load-submit-footer.tsx)。データがルーティンの
// 目標値(RoutineDetail)になる部分だけこの画面固有で持つ。現時点でこの画面を使うのは
// トレーニング画面からの経路のみのため、過去の記録から読み込むフローと違って画面全体の
// 共通ビューへの切り出しは行わない
export default function RoutineLoadScreen() {
  const {
    sessionId: sessionIdParam,
    routineId: routineIdParam,
    routineName,
  } = useLocalSearchParams<{ sessionId: string; routineId: string; routineName: string }>();
  const sessionId = Number(sessionIdParam);
  const routineId = Number(routineIdParam);
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  // null=読み込み中、'error'=取得失敗、値=取得成功。session-history-load-view.tsxと同じ三値管理
  const [detail, setDetail] = useState<RoutineDetail | 'error' | null>(null);
  const fetchDetail = useCallback(() => {
    // sessionId/routineIdが不正な場合は後段で「見つかりません」表示になるだけで、この画面自体は
    // 描画され続ける(hooksの並び保証のためearly returnはrender側でしかできない)。無効なidのまま
    // getRoutineDetailを呼んでも無駄なため、ここでも同じ条件でガードする
    if (!Number.isFinite(sessionId) || !Number.isFinite(routineId)) return undefined;
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
  }, [sessionId, routineId]);
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
      // 表示順(orderIndex順)の並べ直しはaddRoutineExercisesToSession側(detail.exercisesを
      // 絞り込む処理)が担うため、ここでは選んだidをそのまま渡せばよい
      const selections = Array.from(selectedIds).map((routineExerciseId) => ({ routineExerciseId }));
      const prefilled = await addRoutineExercisesToSession(sessionId, routineId, selections);
      notifyPrefilled(prefilled);
      // 画面3→画面2→トレーニング画面の2階層を一度に閉じる(session-history-load.tsxと同じ)
      router.dismiss(2);
    } catch (e) {
      console.error('[add routine exercises to session]', e);
      Alert.alert('エラー', '種目を読み込めませんでした。');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [selectedIds, sessionId, routineId, router]);

  const submitLabel = allSelected ? 'すべて読み込む' : `${selectedIds.size}種目を読み込む`;
  const hasExercises = exercises.length > 0;

  if (!Number.isFinite(sessionId) || !Number.isFinite(routineId)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティン' }} />
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
