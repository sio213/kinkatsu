import { getRoutineDetail } from '@/lib/routines/db';
import { buildRoutineDiff, type RoutineDiff } from '@/lib/routines/diff';
import { getSessionExerciseCards, type SessionHistoryCard } from '@/lib/workout/history';
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
export function useRoutineDiff(
  sessionId: number | null,
  routineId: number | null,
  // 既に同じセッションのカードを取得済みの呼び出し元（完了サマリー）はそれを渡す。
  // 省略すると自前で取りに行く（差分確認画面はこちら）
  providedCards?: SessionHistoryCard[] | 'error' | null,
): RoutineDiffResult {
  // **どのセッション・ルーティンに対する結果なのかをキーで持つ。** 値だけを持って再取得のたびに
  // nullへ戻すと、画面に戻るたび（useFocusEffect経由の取り直し）に一瞬「読み込み中」へ落ちて
  // カードや⋮の項目が消えて出直す。対象が変わったときだけ読み込み中に戻す
  // （use-session-exercise-cards.tsで同じ問題を潰したのと同じ形、@reviewer指摘）
  const key = `${sessionId}:${routineId}`;
  const [state, setState] = useState<{ key: string; diff: RoutineDiff | 'error'; routineName: string | null } | null>(
    null,
  );
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (sessionId == null || routineId == null) {
      setState(null);
      return;
    }
    if (providedCards === 'error') {
      setState({ key, diff: 'error', routineName: null });
      return;
    }
    let cancelled = false;

    Promise.all([
      getRoutineDetail(routineId),
      providedCards ?? getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true }),
    ])
      .then(([detail, cards]) => {
        if (cancelled) return;
        if (!detail) {
          // ルーティンが削除済み。差分の出しようが無いので「差分なし」と同じ扱いにする
          setState({ key, diff: { added: [], changed: [], removed: [] }, routineName: null });
          return;
        }
        setState({ key, diff: buildRoutineDiff(detail.exercises, cards), routineName: detail.routine.name });
      })
      .catch((e) => {
        console.error('[routine diff]', e);
        if (!cancelled) setState({ key, diff: 'error', routineName: null });
      });

    return () => {
      cancelled = true;
    };
    // providedCardsは呼び出し元が取り直すたびに新しい配列になるため、依存に入れると
    // そのたび差分も計算し直される（＝カードと差分が常に同じ世代になる）
  }, [sessionId, routineId, reloadToken, key, providedCards]);

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

  // 対象が切り替わった直後の1フレームに前の対象の結果を描かないよう、keyが一致するときだけ返す
  const current = state?.key === key ? state : null;

  return { diff: current?.diff ?? null, routineName: current?.routineName ?? null, retry };
}
