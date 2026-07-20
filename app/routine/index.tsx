import { RoutineCard } from '@/components/routines/routine-card';
import { HeaderActionButton } from '@/components/ui/header-action-button';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutineReminders, useRoutines } from '@/hooks/use-routines';
import { useStartWithConfirm } from '@/hooks/use-start-with-confirm';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { getRoutineScheduleDisplay } from '@/lib/routines/format';
import { startWorkoutFromRoutine } from '@/lib/workout/session';
import { Stack } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoutineListScreen() {
  const { routines, removeRoutine, swapOrder, duplicateRoutine } = useRoutines();
  const summaries = useRoutineExerciseSummaries();
  const routineReminders = useRoutineReminders();
  const { activeSession } = useWorkoutSessions();
  const pushDebounced = useDebouncedPush();
  const resetDraft = useRoutineDraftStore((state) => state.reset);
  const startRoutine = useStartWithConfirm(
    activeSession,
    (sessionId) => pushDebounced(`/workout/${sessionId}`),
    startWorkoutFromRoutine,
  );

  const handleCreate = useCallback(() => {
    // app/routine/new.tsx自身のマウント時resetに加えてここでも空にしておくことで、
    // 新規作成フォームの初回描画（defaultValuesの読み込み）がuseEffect実行より前に
    // 走っても前回の下書きが一瞬表示される余地を無くす
    resetDraft();
    pushDebounced('/routine/new');
  }, [resetDraft, pushDebounced]);

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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActionButton
              icon="plus"
              label="新規"
              onPress={handleCreate}
              accessibilityLabel="ルーティンを作成"
            />
          ),
        }}
      />
      <FlatList
        style={styles.list}
        data={routines}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <View style={styles.emptyWrapper}>
            <Text style={styles.empty}>ルーティンがありません</Text>
            <PrimaryButton label="＋ 最初のルーティンを作成" onPress={handleCreate} style={styles.emptyAddBtn} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { padding: 16, flexGrow: 1 },
  separator: { height: 11 },

  emptyWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 32 },
  empty: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  emptyAddBtn: { paddingHorizontal: 20 },
});
