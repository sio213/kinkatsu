import { RoutineCard } from '@/components/routines/routine-card';
import { HeaderActionButton } from '@/components/ui/header-action-button';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { Colors, Typography } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useRoutineExerciseSummaries, useRoutineReminders, useRoutines } from '@/hooks/use-routines';
import { getRoutineScheduleDisplay } from '@/lib/routines/format';
import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ルーティンの新規作成・編集フォーム画面はまだ実装されていない（後続タスクで追加）。
// それまでの間はこのAlertで導線だけ用意し、実装後にrouter.push等へ差し替える
function showComingSoon() {
  Alert.alert('準備中', 'この機能は近日公開予定です。');
}

export default function RoutineListScreen() {
  const { routines, removeRoutine, swapOrder } = useRoutines();
  const summaries = useRoutineExerciseSummaries();
  const routineReminders = useRoutineReminders();

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
            onPress={showComingSoon}
            onEdit={showComingSoon}
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
    [summaries, routineReminders, routines, handleSwap, handleDelete],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActionButton
              icon="plus"
              label="新規"
              onPress={showComingSoon}
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
            {/* 作成フォームがまだ無いため、押せそうで押せないボタンにはせず
                控えめなテキストで近日公開であることを伝えるに留める */}
            <Text style={styles.emptyNote}>ルーティンの作成機能は近日公開予定です</Text>
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

  emptyWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 32 },
  empty: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  emptyNote: { ...Typography.footnote, color: Colors.textPlaceholder, textAlign: 'center' },
});
