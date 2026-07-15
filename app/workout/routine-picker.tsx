import { RoutinePickerCard } from '@/components/routines/routine-picker-card';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import type { Routine } from '@/db/schema';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」フローの画面2。ルーティンを1つ選ぶと、
// 画面3(app/workout/routine-load.tsx)でそのルーティン内の種目を個別に選べる（過去の記録から
// 読み込む、と同じ2段階構成）。一覧の取得・見た目はapp/routine/index.tsxと同じフック
// (useRoutines/useRoutineExerciseSummaries)を使うが、こちらは選択専用でルーティン自体の
// 編集・複製・削除は行わないため、RoutinePickerCard(読み取り専用の簡易カード)を使う
export default function RoutinePickerScreen() {
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();

  const handleSelect = useCallback(
    (routine: Routine) => {
      pushDebounced({
        pathname: '/workout/routine-load',
        params: {
          sessionId: String(sessionId),
          routineId: String(routine.id),
          // 画面3のヘッダーでルーティン名を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          routineName: routine.name,
        },
      });
    },
    [pushDebounced, sessionId],
  );

  const renderItem = useCallback(
    ({ item }: { item: Routine }) => {
      const summary = summaries.get(item.id);
      return (
        <ListErrorBoundary>
          <RoutinePickerCard
            name={item.name}
            exerciseCount={summary?.exerciseCount ?? 0}
            categories={summary?.categories ?? []}
            onPress={() => handleSelect(item)}
          />
        </ListErrorBoundary>
      );
    },
    [summaries, handleSelect],
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
      {routines.length === 0 ? (
        <NotFoundState
          message="ルーティンがまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={routines}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { padding: 16 },
  separator: { height: 11 },
});
