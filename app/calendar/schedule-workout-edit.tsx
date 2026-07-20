import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { ScheduledWorkoutExerciseCard } from '@/components/calendar/scheduled-workout-exercise-card';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HeaderTitle } from '@/components/ui/header-title';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useScheduledWorkoutTime } from '@/hooks/use-scheduled-workout';
import { useScheduledWorkoutExercises } from '@/hooks/use-scheduled-workout-exercises';
import { parseDateKey } from '@/lib/calendar/date-grid';
import { formatHourMinuteParts } from '@/lib/calendar/time-of-day';
import { moveScheduledWorkoutExercise, removeScheduledWorkoutExercise } from '@/lib/calendar/scheduled-workout-detail';
import { hasAnyValue } from '@/lib/workout/set-values';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// カレンダーの「直接追加」予定の種目一覧をまとめて編集する画面（2026-07-20新設）。過去の記録の
// 種目カードが記録編集画面(/workout/[sessionId])へ飛ぶのと同じ体験を、まだ実施していない
// 予定にも用意する（@ユーザー指摘）。app/routine/exercise-edit.tsxを参考にしているが、
// ルーティンの下書きストアと違いこの予定は既にDBに永続化済みの実体のため、編集操作は
// すべて即座にDBへ書き込む。まだ実施していない記録のため完了ボタンは持たず、
// app/workout/[id].tsxの過去記録編集モード（isActive===false、フッターにボタンを出さない）
// と同じ考え方で、フッターは「戻る」のみ
export default function ScheduleWorkoutEditScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const keyboardInset = useKeyboardInset();
  const exercises = useScheduledWorkoutExercises(scheduledWorkoutId);
  const scheduledTime = useScheduledWorkoutTime(scheduledWorkoutId);

  // 選択日パネルでは見えていた対象日・時刻を、この画面のヘッダーにも表示する。同日に複数の
  // 直接予定があるとき、どの予定を編集しているか見失わないようにする（@designer指摘）
  const dateLabel = scheduledTime
    ? `${formatSessionDateGroup(parseDateKey(scheduledTime.scheduledDate).getTime())} ${formatHourMinuteParts(scheduledTime.hour, scheduledTime.minute)}`
    : undefined;

  const handleAddExercise = useCallback(() => {
    pushDebounced({
      pathname: '/calendar/schedule-workout-add-exercise',
      params: { scheduledWorkoutId: String(scheduledWorkoutId) },
    });
  }, [pushDebounced, scheduledWorkoutId]);

  const handleSwap = useCallback(
    (scheduledWorkoutExerciseId: number, currentExerciseId: number, currentExerciseName: string, hasRecordedData: boolean) => {
      pushDebounced({
        pathname: '/calendar/schedule-workout-exercise-swap',
        params: {
          scheduledWorkoutExerciseId: String(scheduledWorkoutExerciseId),
          currentExerciseId: String(currentExerciseId),
          currentExerciseName,
          hasRecordedData: hasRecordedData ? 'true' : 'false',
        },
      });
    },
    [pushDebounced],
  );

  const handleDelete = useCallback((scheduledWorkoutExerciseId: number) => {
    Alert.alert('この種目を予定から削除しますか？', '設定した目標セットの内容も削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeScheduledWorkoutExercise(scheduledWorkoutExerciseId);
          } catch (e) {
            console.error('[scheduled workout exercise delete]', e);
            Alert.alert('エラー', 'この予定には最低1種目が必要なため削除できませんでした。');
          }
        },
      },
    ]);
  }, []);

  const handleMove = useCallback(
    async (scheduledWorkoutExerciseId: number, direction: 'up' | 'down') => {
      try {
        await moveScheduledWorkoutExercise(scheduledWorkoutId, scheduledWorkoutExerciseId, direction);
      } catch (e) {
        console.error('[scheduled workout exercise move]', e);
        Alert.alert('エラー', '並び順を変更できませんでした。');
      }
    },
    [scheduledWorkoutId],
  );

  const menuItems: DropdownMenuItem[] = [{ key: 'add', label: '種目を追加', icon: 'add', onPress: handleAddExercise }];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title="種目を編集" subtitle={dateLabel} />,
          headerRight: () => <HeaderMenu groups={[menuItems]} accessibilityLabel="種目編集のメニューを開く" />,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.list}>
          {exercises.map((exercise, index) => (
            <ScheduledWorkoutExerciseCard
              key={exercise.scheduledWorkoutExerciseId}
              exercise={exercise}
              isFirst={index === 0}
              isLast={index === exercises.length - 1}
              isOnlyExercise={exercises.length === 1}
              onSwap={() =>
                handleSwap(
                  exercise.scheduledWorkoutExerciseId,
                  exercise.exerciseId,
                  exercise.name,
                  exercise.sets.some(hasAnyValue),
                )
              }
              onDelete={() => handleDelete(exercise.scheduledWorkoutExerciseId)}
              onMoveUp={() => handleMove(exercise.scheduledWorkoutExerciseId, 'up')}
              onMoveDown={() => handleMove(exercise.scheduledWorkoutExerciseId, 'down')}
            />
          ))}
          <RoutineAddExerciseButton variant="ghost" onPress={handleAddExercise} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="戻る" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  list: { gap: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
