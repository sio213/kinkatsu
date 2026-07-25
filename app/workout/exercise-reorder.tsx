import { ExerciseReorderView } from '@/components/exercises/exercise-reorder-view';
import { useReorderableRows } from '@/hooks/use-reorderable-rows';
import { useSessionExercises, useSessionSets, type SessionExercise } from '@/hooks/use-workout-session';
import { reorderSessionExercises } from '@/lib/workout/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

// ヘッダー⋮「並び替え」(app/workout/[id].tsx)から開く専用画面。ルーティン側(app/routine/exercise-reorder.tsx)
// と違い種目データはDBの実テーブル(workoutSessionExercises)なので、ドラッグ確定(ドロップ)の
// たびにDBへ書き込む。失敗時は他の並び替え操作(session-exercise-card.tsxのhandleMoveUp/Down)と
// 同じ文言でAlertを出し、表示をドラッグ前の並びへ戻す(楽観的UIの巻き戻し。実装は
// hooks/use-reorderable-rows.tsで3画面共通)。書き込みが常に成功する限りDBと表示は都度一致するため、
// フッターの「戻る」もルーティン側と同じく実処理を持たない
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

  const persist = useCallback(
    (next: SessionExercise[]) =>
      reorderSessionExercises(
        sessionId,
        next.map((r) => r.sessionExerciseId),
      ),
    [sessionId],
  );

  const { rows, handleReorder, handleMove } = useReorderableRows({
    source: sessionExercises,
    persist,
    errorMessage: '種目を並び替えられませんでした。',
    logLabel: '[reorder session exercises]',
  });

  return (
    <ExerciseReorderView
      rows={rows}
      keyExtractor={(item) => String(item.sessionExerciseId)}
      setCountOf={(item) => sessionSets.get(item.sessionExerciseId)?.length ?? 0}
      onReorder={handleReorder}
      onMove={handleMove}
      onPressBack={() => router.back()}
    />
  );
}
