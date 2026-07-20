import { ExercisePickerView } from '@/components/workout/exercise-picker-view';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { isValidDateKey, parseDateKey } from '@/lib/calendar/date-grid';
import { updateScheduledWorkoutExercises } from '@/lib/calendar/scheduled-workouts';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

// "1,2,3"形式のexerciseIdsパラメータを検証しつつ配列にする（schedule-time-picker.tsxと同じ方針）。
// 1件でも不正なidが混ざっていたら直リンク等の異常値とみなし空配列にフォールバックする
function parseExerciseIds(value: string | undefined): number[] {
  if (!value) return [];
  const ids = value.split(',').map(Number);
  return ids.every(isPositiveInteger) ? ids : [];
}

// カレンダー選択日パネル「予定を追加」→「直接追加」フローの画面1（2026-07-20新設）。
// app/routine/exercise-picker.tsxと同じく、DB非依存の汎用ExercisePickerView（onConfirmで
// 選択順を保持した種目id配列を受け取る）をそのまま使う。
//
// scheduledWorkoutId付きで開かれた場合は編集モード（2026-07-20追加）: 直接予定の種目一覧
// カード（DirectScheduleExerciseGroup）をタップしたときの遷移先で、既存の種目を選択済み
// 状態で表示し、確定すると（新規作成のようにschedule-time-pickerを経由せず）その場で
// scheduledWorkoutExercisesを更新して前の画面へ戻る（過去の記録の種目カードが
// 記録編集画面(/workout/[sessionId])へ飛ぶのと同じ「まとめて編集する」体験、@ユーザー指摘）。
// 既存の選択済みexerciseIdsは、呼び出し元(app/(tabs)/calendar.tsx)が既に手元に持っている
// card.exerciseIdsをそのままルートパラメータとして渡す（この画面で改めてDBを引き直さない）。
// これにより「live queryの解決待ち」「該当予定が見つからない場合の永続的な空白画面」という
// 状態を作らずに済む（@tester指摘: DBを引き直す設計だと読み込み中と削除済みを区別できない）。
// scheduledWorkoutIdが無ければ従来通りの新規作成モードで、選んだ種目idをschedule-time-picker
// （画面2、時刻確定）へ引き継ぐだけでまだDBに書き込まない
export default function ScheduleExercisePickerScreen() {
  const {
    dateKey,
    scheduledWorkoutId: scheduledWorkoutIdParam,
    exerciseIds: exerciseIdsParam,
  } = useLocalSearchParams<{
    dateKey: string;
    scheduledWorkoutId?: string;
    exerciseIds?: string;
  }>();
  const scheduledWorkoutId =
    scheduledWorkoutIdParam && isPositiveInteger(Number(scheduledWorkoutIdParam)) ? Number(scheduledWorkoutIdParam) : null;
  const isEditMode = scheduledWorkoutId != null;
  const initialSelectedIds = useMemo(() => parseExerciseIds(exerciseIdsParam), [exerciseIdsParam]);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();

  const handlePressInfo = useCallback(
    (id: number) => {
      pushDebounced(`/exercise/${id}`);
    },
    [pushDebounced],
  );

  const handleConfirmCreate = useCallback(
    (selectedIds: number[]) => {
      if (selectedIds.length === 0) return;
      pushDebounced({
        pathname: '/calendar/schedule-time-picker',
        params: { dateKey, exerciseIds: selectedIds.join(',') },
      });
    },
    [pushDebounced, dateKey],
  );

  const handleConfirmEdit = useCallback(
    async (selectedIds: number[]) => {
      if (selectedIds.length === 0 || scheduledWorkoutId == null) return;
      try {
        await updateScheduledWorkoutExercises(scheduledWorkoutId, selectedIds);
        router.back();
      } catch (e) {
        console.error('[schedule exercise update]', e);
        Alert.alert('エラー', '種目の更新に失敗しました。');
      }
    },
    [scheduledWorkoutId, router],
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
  // 編集モードで種目idが1件も無い（直リンクでexerciseIdsを省略された等）場合も同様に防御する
  if (isEditMode && initialSelectedIds.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: '種目を編集' }} />
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
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
          headerTitle: () => <HeaderTitle title={isEditMode ? '種目を編集' : '種目を選択'} subtitle={dateLabel} />,
        }}
      />
      <ExercisePickerView
        onPressInfo={handlePressInfo}
        onConfirm={isEditMode ? handleConfirmEdit : handleConfirmCreate}
        initialSelectedIds={isEditMode ? initialSelectedIds : undefined}
        confirmLabel={isEditMode ? (count) => (count > 0 ? `${count}件で保存` : '保存') : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
