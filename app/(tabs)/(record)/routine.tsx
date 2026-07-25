import { RoutineCard } from '@/components/routines/routine-card';
import { RoutineCreateHeaderButton } from '@/components/routines/routine-create-header-button';
import { RoutineEmptyState } from '@/components/routines/routine-empty-state';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { ScreenStyles } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutineReminders, useRoutines } from '@/hooks/use-routines';
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { getRoutineScheduleDisplay } from '@/lib/routines/format';
import { startWorkoutFromRoutine } from '@/lib/workout/session';
import { Stack } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoutineListScreen() {
  const { routines, removeRoutine, swapOrder, duplicateRoutine } = useRoutines();
  const summaries = useRoutineExerciseSummaries();
  const routineReminders = useRoutineReminders();
  const { activeSession } = useWorkoutSessions();
  const pushDebounced = useDebouncedPush();
  const startRoutine = useStartWithConfirm(
    activeSession,
    (sessionId) => pushDebounced(`/workout/${sessionId}`),
    startWorkoutFromRoutine,
  );

  const handleEdit = useCallback(
    (id: number) => {
      pushDebounced(`/routine/edit/${id}`);
    },
    [pushDebounced],
  );

  // カードの「開始」ボタン専用の処理（カード本体タップは編集画面へ、@designerレビュー）。
  // 進行中セッションがある場合の確認ダイアログを含むロジックはuseStartWithConfirmに
  // 共通化してある（カレンダー選択日パネルの予定カード「開始」ボタンと挙動が同一のため）
  const handleStartWorkout = useCallback(
    (routine: Routine) => startRoutine(routine.id, routine.name),
    [startRoutine],
  );

  // 複製メニュー。作っただけで一覧に戻すと「コピー」の名前のまま放置されがちなので、複製直後に
  // そのまま編集画面へ遷移させ、名前欄にフォーカスを当てて即リネームを促す（実機フィードバックで指摘）。
  // 複製は削除と違って確認ダイアログを挟まず即実行するため、DB書き込み中に⋮メニューを再度開いて
  // 連打すると同じルーティンが複数複製されうる。useWorkoutStarterのisStartingRefと同じ方針で
  // 処理中の再実行をガードする（レビュー指摘）
  const isDuplicatingRef = useRef(false);
  const handleDuplicate = useCallback(
    async (routine: Routine) => {
      if (isDuplicatingRef.current) return;
      isDuplicatingRef.current = true;
      try {
        const newId = await duplicateRoutine(routine.id);
        pushDebounced({ pathname: '/routine/edit/[id]', params: { id: String(newId), focusName: '1' } });
      } catch (e) {
        console.error('[routine duplicate]', e);
        Alert.alert('エラー', 'ルーティンの複製に失敗しました。');
      } finally {
        isDuplicatingRef.current = false;
      }
    },
    [duplicateRoutine, pushDebounced],
  );

  const handleDelete = useCallback(
    (routine: Routine) => {
      Alert.alert('削除', `「${routine.name}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeRoutine(routine.id);
            } catch (e) {
              console.error('[routine delete]', e);
              Alert.alert('エラー', 'ルーティンの削除に失敗しました。');
            }
          },
        },
      ]);
    },
    [removeRoutine],
  );

  const handleSwap = useCallback(
    async (id: number, targetId: number) => {
      try {
        await swapOrder(id, targetId);
      } catch (e) {
        console.error('[routine swap order]', e);
        Alert.alert('エラー', 'ルーティンの並び替えに失敗しました。');
      }
    },
    [swapOrder],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Routine; index: number }) => {
      const summary = summaries.get(item.id);
      const schedule = getRoutineScheduleDisplay(routineReminders.get(item.id) ?? null);
      return (
        <ListErrorBoundary>
          <RoutineCard
            name={item.name}
            exerciseCount={summary?.exerciseCount ?? 0}
            categories={summary?.categories ?? []}
            schedule={schedule}
            isFirst={index === 0}
            isLast={index === routines.length - 1}
            onPress={() => handleEdit(item.id)}
            onStart={() => handleStartWorkout(item)}
            onEdit={() => handleEdit(item.id)}
            onDuplicate={() => handleDuplicate(item)}
            onMoveUp={() => {
              // isFirst/isLastのdisabled判定により通常はここに来ないが、メニュー展開中に
              // 他操作でroutinesが更新される競合を考慮し、配列外アクセスにしない
              const target = routines[index - 1];
              if (target) handleSwap(item.id, target.id);
            }}
            onMoveDown={() => {
              const target = routines[index + 1];
              if (target) handleSwap(item.id, target.id);
            }}
            onDelete={() => handleDelete(item)}
          />
        </ListErrorBoundary>
      );
    },
    [summaries, routineReminders, routines, handleStartWorkout, handleEdit, handleDuplicate, handleSwap, handleDelete],
  );

  return (
    // タブ配下の画面はタブバーが下端を占有するのでedges={[]}が正（他のタブ画面と統一）。
    // ルートStack上にあった頃はホームインジケータ分を自前で確保するedges={['bottom']}だった
    <SafeAreaView style={ScreenStyles.safeArea} edges={[]}>
      <Stack.Screen options={{ headerRight: () => <RoutineCreateHeaderButton /> }} />
      {/* 0件時はルーティン選択画面（components/routines/routine-picker-list.tsx）と同じ
          デザイン案06-b′の空状態に揃える。タブ直下の一覧で戻る先が無いためonPressBackは渡さず、
          「戻る」を出さない（@ユーザー指摘）。
          ListEmptyComponentではなくFlatListの外で分岐するのは、contentContainerStyleの
          padding:16がEmptyState自身のpaddingHorizontal:28に足されて左右44ptになり、
          同じ文言・同じ改行位置なのにルーティン選択画面（28pt）と折り返し幅がズレるため
          （@reviewer指摘） */}
      {routines.length === 0 ? (
        <RoutineEmptyState />
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
  list: { flex: 1 },
  content: { padding: 16, flexGrow: 1 },
  separator: { height: 11 },
});
