import { SessionReorderExerciseCard } from '@/components/workout/session-reorder-exercise-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useSessionExercises, useSessionSets, type SessionExercise } from '@/hooks/use-workout-session';
import { reorderSessionExercises } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import ReorderableList, { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「並び替え」(app/workout/[id].tsx)から開く専用画面。ルーティン側(app/routine/exercise-reorder.tsx)
// と違い種目データはDBの実テーブル(workoutSessionExercises)なので、ドラッグ確定(ドロップ)の
// たびにDBへ書き込む。失敗時は他の並び替え操作(session-exercise-card.tsxのhandleMoveUp/Down)と
// 同じ文言でAlertを出し、表示をドラッグ前の並びへ戻す(楽観的UIの巻き戻し)。書き込みが常に
// 成功する限りDBと表示は都度一致するため、フッターの「戻る」もルーティン側と同じく実処理を持たない
export default function WorkoutExerciseReorderScreen() {
  const router = useRouter();
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();
  const parsedSessionId = Number(sessionIdParam);
  const sessionId = Number.isFinite(parsedSessionId) ? parsedSessionId : -1;
  const sessionExercises = useSessionExercises(sessionId);
  // setCountはこの画面では編集されない(セット記録自体は前画面でのみ行う)ため、rowsの
  // スナップショットには含めずsessionSetsから都度ライブ参照する。もしrows側に焼き込むと、
  // sessionExercises・sessionSetsは別々のuseLiveQueryのため、seed時にsessionSetsがまだ
  // 解決していない(0件)瞬間に固定されてしまい、以後ずっと「0セット」表示のままになりうる
  const sessionSets = useSessionSets(sessionId);

  // 開いた時点のスナップショットをローカルstateに固定し、以後はlive queryを描画に使わない
  // (ドラッグ中にDB更新由来の再購読が割り込むと、並び替え中の表示と競合するため)。
  // この画面は種目2件以上でしか開けない(呼び出し元でガード済み)ため、初回に1件でも
  // sessionExercisesが来た時点で一度だけ取り込めば十分
  const seededRef = useRef(false);
  const [rows, setRows] = useState<SessionExercise[]>([]);
  if (!seededRef.current && sessionExercises.length > 0) {
    seededRef.current = true;
    setRows(sessionExercises);
  }

  // 素早い連続ドラッグ等で複数のDB書き込みが同時に走った場合、先に失敗した古い操作の巻き戻しが
  // 後から成功した新しい操作の結果を上書きしないよう、常に最新の操作だけが巻き戻しを行えるようにする
  const latestOperationRef = useRef(0);

  const persist = useCallback(
    async (next: SessionExercise[], previous: SessionExercise[]) => {
      const operationId = ++latestOperationRef.current;
      try {
        await reorderSessionExercises(
          sessionId,
          next.map((r) => r.sessionExerciseId),
        );
      } catch (e) {
        console.error('[reorder session exercises]', e);
        Alert.alert('エラー', '種目を並び替えられませんでした。');
        if (operationId === latestOperationRef.current) setRows(previous);
      }
    },
    [sessionId],
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
          <SessionReorderExerciseCard
            exercise={item}
            setCount={sessionSets.get(item.sessionExerciseId)?.length ?? 0}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onMoveUp={() => handleMove(index, 'up')}
            onMoveDown={() => handleMove(index, 'down')}
          />
        )}
        keyExtractor={(item) => String(item.sessionExerciseId)}
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
