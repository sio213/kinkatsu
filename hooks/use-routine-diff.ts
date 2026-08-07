import { getRoutineDetail } from '@/lib/routines/db';
import { buildRoutineDiff, type RoutineDiff } from '@/lib/routines/diff';
import { getSessionExerciseCards } from '@/lib/workout/history';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export type RoutineDiffResult = {
  // null=読み込み中、'error'=取得失敗（use-session-exercise-cards.tsと同じ三値管理）
  diff: RoutineDiff | 'error' | null;
  routineName: string | null;
  retry: () => void;
};

/**
 * ルーティンから開始したセッションについて、ルーティンのテンプレートと今日の実績の差分を取る。
 *
 * ✓未確定のセットも含める（includeUnconfirmedCards: true）。ルーティンは実績ではなく
 * 「これから毎回やる型」なので、✓の押し忘れで種目が差分から漏れる方が困る。
 * 完了サマリーの種目一覧が同じ基準で並んでいるので、見えているものと差分が一致する。
 *
 * live queryではなく都度取得。差分はルーティン側とセッション側の両方に依存する重い突き合わせで、
 * 単純なクエリ購読には落とし込めない（use-session-exercise-cards.tsと同じ理由）。
 * 代わりに画面の再フォーカス時に取り直すので、記録編集やルーティン編集から戻れば最新になる。
 */
export function useRoutineDiff(sessionId: number | null, routineId: number | null): RoutineDiffResult {
  const [diff, setDiff] = useState<RoutineDiff | 'error' | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (sessionId == null || routineId == null) {
      setDiff(null);
      setRoutineName(null);
      return;
    }
    let cancelled = false;
    setDiff(null);

    Promise.all([getRoutineDetail(routineId), getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true })])
      .then(([detail, cards]) => {
        if (cancelled) return;
        if (!detail) {
          // ルーティンが削除済み。差分の出しようが無いので「差分なし」と同じ扱いにする
          setDiff({ added: [], changed: [], removed: [] });
          setRoutineName(null);
          return;
        }
        setRoutineName(detail.routine.name);
        setDiff(buildRoutineDiff(detail.exercises, cards));
      })
      .catch((e) => {
        console.error('[routine diff]', e);
        if (!cancelled) setDiff('error');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, routineId, reloadToken]);

  // 記録編集・ルーティン編集から戻ったときに取り直す。初回マウント時のフォーカスは
  // 上のeffectが既に取得を担うため、二重取得を避けて最初の1回だけスキップする
  // （use-session-exercise-cards.tsと同じ形）
  const isFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      retry();
    }, [retry]),
  );

  return { diff, routineName, retry };
}
