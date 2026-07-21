import { isSameDay } from '@/lib/calendar/date-grid';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { compareToPrevious, type SetComparison } from '@/lib/workout/comparison';
import {
  computePersonalBestIds,
  getExerciseHistoryEntries,
  getSessionExerciseCards,
  NO_SESSION_TO_EXCLUDE,
  type SessionHistoryCard,
} from '@/lib/workout/history';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkoutSessions } from './use-workout-session';

export type CalendarDayCard = SessionHistoryCard & {
  sessionId: number;
  // 同日複数セッションの時間帯グループ分け（朝/昼/夕方/夜）に使う、そのカードが属する
  // セッションの開始時刻。sessionIdと同様getSessionExerciseCardsの戻り値には無いため付与する
  sessionStartedAt: number;
  isBest: boolean;
  // 直前の同種目セッションとの比較（前回比較数値）。比較対象が無い/変化なしならnull
  comparison: SetComparison | null;
};

export type UseCalendarDayExercisesResult = {
  cards: CalendarDayCard[] | 'error' | null;
  // 取得失敗時にユーザー操作で再取得するための関数（同じ日付を選択したままでは
  // daySessionIdsKeyが変化せず自動では再実行されないため、明示的な再実行手段が要る）
  retry: () => void;
};

// 選択中の日付に開始した終了済みセッション（複数セッションがあれば全て）の種目カードを、
// 自己ベスト判定・前回比較つきでまとめて返す。getSessionExerciseCardsにincludeUnconfirmedCards:true
// を渡しており、✓未確定セットのみのカード（月グリッドの実績マーカーと表示対象を揃えるため）も
// 含む点が「読み込む種目を選ぶ」画面（確定セットを持つカードのみ）と異なる。cards: null=読み込み中、
// 'error'=取得失敗、配列=取得成功（0件含む）（session-history-load-view.tsxと同じ三値管理）。
// 対象日のセッション自体はuseWorkoutSessions()のlive queryから絞り込むため一覧の増減に追従するが、
// 各カードの中身（種目・セット・自己ベスト・前回比較）はgetSessionExerciseCards等の一括取得を
// 都度実行する一時点のスナップショットで、live query化はしていない（カレンダーで過去日を見ている間に
// 裏でその日の記録が編集される状況は通常発生しないため）
export function useCalendarDayExercises(selectedDate: Date): UseCalendarDayExercisesResult {
  const { sessions } = useWorkoutSessions();
  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.endedAt != null && isSameDay(new Date(s.startedAt), selectedDate))
        .map((s) => ({ id: s.id, startedAt: s.startedAt })),
    [sessions, selectedDate],
  );
  // 依存配列の安定化用キー。daySessionsは中身が同じでも毎レンダー新しい配列参照になり得るため、
  // このkeyをeffectの依存にすることで中身が変わらない限り再実行されないようにする
  // （daySessions自体はeffect内でそのまま参照する。exhaustive-depsはkeyで代替しているため無効化する）
  const daySessionIdsKey = daySessions.map((s) => s.id).join(',');
  // retryToken: ユーザーが「再試行」を押した時だけインクリメントし、daySessionIdsKeyが
  // 同じ（＝同じ日付を選んだまま）でもeffectを再実行させるためのトリガー
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  const [result, setResult] = useState<CalendarDayCard[] | 'error' | null>(null);

  useEffect(() => {
    // 対象セッションが無い日は取得処理そのものが不要なので、ローディング状態を経由せず
    // 同期的に空配列を確定する（一瞬スピナーが出てすぐ消えるちらつきを防ぐ）
    if (daySessions.length === 0) {
      setResult([]);
      return;
    }

    let cancelled = false;
    setResult(null);

    (async () => {
      try {
        // getSessionExerciseCardsの戻り値にはsessionId/sessionStartedAtが含まれないため、
        // 前回比較の「自分自身のセッションを除外する」判定・時間帯グループ分けに使えるよう
        // ここでカードへ付与しておく
        const cardsBySession = await Promise.all(
          daySessions.map(async ({ id: sessionId, startedAt: sessionStartedAt }) => {
            const cards = await getSessionExerciseCards(sessionId, { includeUnconfirmedCards: true });
            return cards.map((c) => ({ ...c, sessionId, sessionStartedAt }));
          }),
        );
        const cards = cardsBySession.flat();

        // 種目ごとに履歴全件（✓確定セットを持つカードのみ、new順）を取り、自己ベストの
        // カードidを集める（同じ種目が複数カードあっても履歴取得は種目単位で1回で済ませる）。
        // 前回比較もこの同じ履歴（確定セットのみ）を基準にすることで、自己ベスト判定と
        // 前回比較で「確定/未確定」の基準がズレないようにする
        const uniqueExerciseIds = [...new Set(cards.map((c) => c.exerciseId))];
        const bestCardIds = new Set<number>();
        const entriesByExerciseId = new Map<number, Awaited<ReturnType<typeof getExerciseHistoryEntries>>>();
        await Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => {
            const sample = cards.find((c) => c.exerciseId === exerciseId)!;
            const measurementType = resolveMeasurementType(sample.measurementType);
            // NO_SESSION_TO_EXCLUDE: ここでは「今表示中の記録自身」も自己ベスト比較に含めたい
            // （元々の用途はルーティン編集画面のようにセッション概念が無い場面向けの番兵だが、
            // 「除外セッションなし＝全履歴を対象にする」という意味は今回の用途にもそのまま合致する）
            const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);
            entriesByExerciseId.set(exerciseId, entries);
            for (const id of computePersonalBestIds(entries, measurementType)) bestCardIds.add(id);
          }),
        );

        // カードごとに直前の同種目セッションと比較する。「直前」は自分自身が属するsessionId
        // を除外するだけでは不十分で、時刻で見て厳密に自分より前（startedAt未満）のエントリに
        // 限定する必要がある。同日に複数セッションがある場合（時間帯グループ機能で一般的になった）、
        // sessionIdだけで除外すると朝カードの「前回」が時系列的に後の同日夜セッションになって
        // しまうバグがあったため（PR8で発覚）、sessionId除外に加えstartedAt未満の条件も併せて課す
        const resultCards = cards.map((c) => {
          const confirmedSets = c.sets.filter((s) => s.completedAt != null);
          const measurementType = resolveMeasurementType(c.measurementType);
          const entries = entriesByExerciseId.get(c.exerciseId) ?? [];
          const previousEntry = entries.find((e) => e.sessionId !== c.sessionId && e.startedAt < c.sessionStartedAt);
          const previousSets = previousEntry ? previousEntry.sets.filter((s) => s.completedAt != null) : [];
          const comparison = compareToPrevious(measurementType, confirmedSets, previousSets);
          return { ...c, isBest: bestCardIds.has(c.workoutSessionExerciseId), comparison };
        });

        if (!cancelled) {
          setResult(resultCards);
        }
      } catch (e) {
        console.error('[calendar day exercises]', e);
        if (!cancelled) setResult('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daySessionIdsKey, retryToken]);

  return { cards: result, retry };
}
