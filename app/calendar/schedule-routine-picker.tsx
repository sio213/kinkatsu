import { RoutinePickerCard } from '@/components/routines/routine-picker-card';
import { HeaderTitle } from '@/components/ui/header-title';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面1（PR10、手動での予定追加）。
// app/workout/routine-picker.tsxと同じ「一覧から1件選ぶだけ」の画面で、見た目・データ取得
// (useRoutines/useRoutineExerciseSummaries)もそのまま流用する。日付は選択日パネルで
// 既に確定しているため選び直させず、dateKeyをparamsで次画面へそのまま引き継ぐだけ。
// リマインダー予定の「今回だけ差し替え」（PR10-6b）でもこの画面を再利用する。差し替え元の
// reminderId等（replaceXxx、下記4項目はセットで渡る）が付いている場合だけ見出し・サブタイトルを
// 差し替え用に出し分け、次画面へもそのまま引き継ぐ
export default function ScheduleRoutinePickerScreen() {
  const { dateKey, replaceReminderId, replaceRoutineName, replaceHour, replaceMinute } = useLocalSearchParams<{
    dateKey: string;
    replaceReminderId?: string;
    replaceRoutineName?: string;
    replaceHour?: string;
    replaceMinute?: string;
  }>();
  const isReplaceMode = replaceReminderId !== undefined;
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();

  const handleSelect = useCallback(
    (routine: Routine) => {
      pushDebounced({
        pathname: '/calendar/schedule-time-picker',
        params: {
          dateKey,
          routineId: String(routine.id),
          routineName: routine.name,
          ...(isReplaceMode ? { replaceReminderId, replaceHour, replaceMinute } : {}),
        },
      });
    },
    [pushDebounced, dateKey, isReplaceMode, replaceReminderId, replaceHour, replaceMinute],
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

  // カレンダー画面から遷移する限り不正なdateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（dateKeyが不正なままparseDateKeyに渡るとクラッシュするため）
  if (!isValidDateKey(dateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'ルーティンを選択' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle
              title={isReplaceMode ? '差し替えるルーティンを選択' : 'ルーティンを選択'}
              subtitle={
                isReplaceMode
                  ? `${formatSessionDateGroup(parseDateKey(dateKey).getTime())}・「${replaceRoutineName}」を差し替え`
                  : formatSessionDateGroup(parseDateKey(dateKey).getTime())
              }
            />
          ),
        }}
      />
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
