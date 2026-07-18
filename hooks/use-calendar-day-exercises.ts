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

// 選択中の日付に開始した完了済みセッション（複数セッションがあれば全て）の種目カードを、
// 自己ベスト判定・前回比較つきでまとめて返す。cards: null=読み込み中、'error'=取得失敗、
// 配列=取得成功（0件含む）（session-history-load-view.tsxと同じ三値管理）。
// 対象日のセッション自体はuseWorkoutSessions()のlive queryから絞り込むため一覧の増減に追従するが、
// 各カードの中身（種目・セット・自己ベスト・前回比較）はgetSessionExerciseCards等の一括取得を
// 都度実行する一時点のスナップショットで、live query化はしていない（カレンダーで過去日を見ている間に
// 裏でその日の記録が編集される状況は通常発生しないため）
export function useCalendarDayExercises(selectedDate: Date): UseCalendarDayExercisesResult {
  const { sessions } = useWorkoutSessions();
  const daySessionIds = useMemo(
    () =>
      sessions
        .filter((s) => s.endedAt != null && isSameDay(new Date(s.startedAt), selectedDate))
        .map((s) => s.id),
    [sessions, selectedDate],
  );
  // 依存配列の安定化用キー。daySessionIdsは中身が同じでも毎レンダー新しい配列参照になり得るため、
  // このkeyをeffectの依存にすることで中身が変わらない限り再実行されないようにする
  // （daySessionIds自体はeffect内でそのまま参照する。exhaustive-depsはkeyで代替しているため無効化する）
  const daySessionIdsKey = daySessionIds.join(',');
  // retryToken: ユーザーが「再試行」を押した時だけインクリメントし、daySessionIdsKeyが
  // 同じ（＝同じ日付を選んだまま）でもeffectを再実行させるためのトリガー
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  const [result, setResult] = useState<CalendarDayCard[] | 'error' | null>(null);

  useEffect(() => {
    // 対象セッションが無い日は取得処理そのものが不要なので、ローディング状態を経由せず
    // 同期的に空配列を確定する（一瞬スピナーが出てすぐ消えるちらつきを防ぐ）
    if (daySessionIds.length === 0) {
      setResult([]);
      return;
    }

    let cancelled = false;
    setResult(null);

    (async () => {
      try {
        // getSessionExerciseCardsの戻り値にはsessionIdが含まれないため、前回比較で
        // 「自分自身のセッションを除外する」判定に使えるようここでカードへ付与しておく
        const cardsBySession = await Promise.all(
          daySessionIds.map(async (sessionId) => {
            const cards = await getSessionExerciseCards(sessionId);
            return cards.map((c) => ({ ...c, sessionId }));
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

        // カードごとに直前の同種目セッション（自分自身が属するsessionIdは除外）と比較する。
        // entriesは新しい順で並んでいるため、自セッション以外で最初に見つかった1件が「前回」になる
        const resultCards = cards.map((c) => {
          const confirmedSets = c.sets.filter((s) => s.completedAt != null);
          const measurementType = resolveMeasurementType(c.measurementType);
          const entries = entriesByExerciseId.get(c.exerciseId) ?? [];
          const previousEntry = entries.find((e) => e.sessionId !== c.sessionId);
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
