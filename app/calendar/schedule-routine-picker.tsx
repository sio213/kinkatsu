import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」フローの画面1（PR10、手動での予定追加）。
// app/workout/routine-picker.tsxと同じ「一覧から1件選ぶだけ」の画面で、見た目・データ取得
// (useRoutines/useRoutineExerciseSummaries)もそのまま流用する。日付は選択日パネルで
// 既に確定しているため選び直させず、dateKeyをparamsで次画面へそのまま引き継ぐだけ。
// 描画部分（一覧・空状態）はcomponents/routines/routine-picker-list.tsxへ集約している
// （2026-07-20、@reviewer指摘: app/workout/routine-picker.tsx・
// app/workout/start-routine-picker.tsxと合わせて3本目の同型ピッカーに到達したため）。
// 「今回だけ差し替え」（PR10-6b）でもこの画面を再利用していたが、2026-07-22に
// ⋮メニュー撤去と合わせて差し替え機能自体を廃止したため、その分岐は無くなった
export default function ScheduleRoutinePickerScreen() {
  const { dateKey } = useLocalSearchParams<{ dateKey: string }>();
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();

  const handleSelect = useCallback(
    (routine: Routine) => {
      pushDebounced({
        pathname: '/calendar/schedule-time-picker',
        params: { dateKey, routineId: String(routine.id), routineName: routine.name },
      });
    },
    [pushDebounced, dateKey],
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
            <HeaderTitle title="ルーティンを選択" subtitle={formatSessionDateGroup(parseDateKey(dateKey).getTime())} />
          ),
        }}
      />
      <RoutinePickerList
        routines={routines}
        summaries={summaries}
        onSelect={handleSelect}
        onPressBack={() => router.back()}
        hint="タップして時刻を選ぶ画面に進みます"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
