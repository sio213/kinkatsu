import { ScheduledWorkoutReorderExerciseCard } from '@/components/calendar/scheduled-workout-reorder-exercise-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useScheduledWorkoutExercises, type ScheduledWorkoutExerciseDetail } from '@/hooks/use-scheduled-workout-exercises';
import { reorderScheduledWorkoutExercises } from '@/lib/calendar/scheduled-workout-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import ReorderableList, { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「並び替え」(app/calendar/schedule-workout-edit.tsx)から開く専用画面。
// app/workout/exercise-reorder.tsxのカレンダー版。種目データはDBの実テーブル
// (scheduledWorkoutExercises)なので、ドラッグ確定(ドロップ)のたびにDBへ書き込む。失敗時は
// 他の並び替え操作(schedule-workout-edit.tsxのhandleMove)と同じ文言でAlertを出し、表示を
// ドラッグ前の並びへ戻す(楽観的UIの巻き戻し)
export default function ScheduleWorkoutExerciseReorderScreen() {
  const router = useRouter();
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const parsedScheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const scheduledWorkoutId = Number.isFinite(parsedScheduledWorkoutId) ? parsedScheduledWorkoutId : -1;
  const exercises = useScheduledWorkoutExercises(scheduledWorkoutId);

  // 開いた時点のスナップショットをローカルstateに固定し、以後はlive queryを描画に使わない
  // (ドラッグ中にDB更新由来の再購読が割り込むと、並び替え中の表示と競合するため)。この画面は
  // 種目2件以上でしか開けない(呼び出し元でガード済み)ため、初回に1件でもexercisesが来た時点で
  // 一度だけ取り込めば十分（app/workout/exercise-reorder.tsxと同じ方針）
  const seededRef = useRef(false);
  const [rows, setRows] = useState<ScheduledWorkoutExerciseDetail[]>([]);
  if (!seededRef.current && exercises.length > 0) {
    seededRef.current = true;
    setRows(exercises);
  }

  // 素早い連続ドラッグ等で複数のDB書き込みが同時に走った場合、先に失敗した古い操作の巻き戻しが
  // 後から成功した新しい操作の結果を上書きしないよう、常に最新の操作だけが巻き戻しを行えるようにする
  const latestOperationRef = useRef(0);

  const persist = useCallback(
    async (next: ScheduledWorkoutExerciseDetail[], previous: ScheduledWorkoutExerciseDetail[]) => {
      const operationId = ++latestOperationRef.current;
      try {
        await reorderScheduledWorkoutExercises(
          scheduledWorkoutId,
          next.map((r) => r.scheduledWorkoutExerciseId),
        );
      } catch (e) {
        console.error('[reorder scheduled workout exercises]', e);
        Alert.alert('エラー', '並び順を変更できませんでした。');
        if (operationId === latestOperationRef.current) setRows(previous);
      }
    },
    [scheduledWorkoutId],
  );

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      const previous = rows;
      const next = reorderItems(rows, from, to);
      setRows(next);
      persist(next, previous);
    },
    [rows, persist],
  );

  // ドラッグ操作は支援技術から実行できないため、各行のドラッグハンドルに上へ/下へ移動の
  // accessibilityActionsを提供し、隣接1件だけの入れ替えという形で同じ並び替えを代替する
  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= rows.length) return;
      const previous = rows;
      const next = reorderItems(rows, index, targetIndex);
      setRows(next);
      persist(next, previous);
    },
    [rows, persist],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ReorderableList
        data={rows}
        onReorder={handleReorder}
        renderItem={({ item, index }) => (
          <ScheduledWorkoutReorderExerciseCard
            exercise={item}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onMoveUp={() => handleMove(index, 'up')}
            onMoveDown={() => handleMove(index, 'down')}
          />
        )}
        keyExtractor={(item) => String(item.scheduledWorkoutExerciseId)}
        shouldUpdateActiveItem
        style={styles.list}
        contentContainerStyle={styles.content}
        renderDropIndicator={() => (
          <View style={styles.dropIndicator}>
            <View style={styles.dropIndicatorDot} />
          </View>
        )}
      />
      <View style={styles.footer}>
        <PrimaryButton label="戻る" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 8 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dropIndicator: {
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.accent,
    marginHorizontal: 6,
  },
  dropIndicatorDot: {
    position: 'absolute',
    left: -1,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
});
