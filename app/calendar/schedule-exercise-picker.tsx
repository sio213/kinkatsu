import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダー選択日パネル「予定を追加」→「直接追加」フローの画面1（2026-07-20新設）。
// app/routine/exercise-picker.tsxと同じく、DB非依存の汎用ExercisePickerView（onConfirmで
// 選択順を保持した種目id配列を受け取る）をそのまま使う。ここではまだDBに書き込まず、
// 選んだ種目idをschedule-time-picker（画面2、時刻確定）へ引き継ぐだけ
// （ルーティン版のschedule-routine-picker→schedule-time-pickerと同じ2段階構成）。
// 既存予定に種目を追加する場合はapp/calendar/schedule-workout-add-exercise.tsx、
// 既存予定の種目・目標セットをまとめて編集する場合はapp/calendar/schedule-workout-edit.tsxを使う
// （どちらも既存予定の種目一覧カード(components/calendar/scheduled-workout-exercise-group.tsx)
// タップ後の導線で、この画面は新規作成専用、2026-07-20に編集モードを分離）
export default function ScheduleExercisePickerScreen() {
  const { dateKey } = useLocalSearchParams<{ dateKey: string }>();
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleConfirm = useCallback(
    (selectedIds: number[]) => {
      if (selectedIds.length === 0) return;
      pushDebounced({
        pathname: '/calendar/schedule-time-picker',
        params: { dateKey, exerciseIds: selectedIds.join(',') },
      });
    },
    [pushDebounced, dateKey],
  );

  // カレンダー画面から遷移する限り不正なdateKeyは渡らないが、不正な直リンク等への防御として
  // 明示的にガードする（schedule-chooser.tsxと同じ方針）
  if (!isValidDateKey(dateKey)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '種目を選択' }} />
        <NotFoundState message="日付が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  // schedule-chooser.tsx/schedule-routine-pickerと同じくヘッダーsubtitleで対象日を常時表示する。
  // 以前はタイトルのみで、前画面で選んだはずの日付を種目選択中に見失う指摘があった（@designer指摘）
  const dateLabel = formatSessionDateGroup(parseDateKey(dateKey).getTime());

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="種目を選択" subtitle={dateLabel} />,
        }}
      />
      <ExercisePickerView onPressInfo={handlePressInfo} onConfirm={handleConfirm} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
