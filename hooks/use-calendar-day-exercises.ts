import { isSameDay } from '@/lib/calendar/date-grid';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import {
  computePersonalBestIds,
  getExerciseHistoryEntries,
  getSessionExerciseCards,
  NO_SESSION_TO_EXCLUDE,
  type SessionHistoryCard,
} from '@/lib/workout/history';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkoutSessions } from './use-workout-session';

export type CalendarDayCard = SessionHistoryCard & { isBest: boolean };

export type UseCalendarDayExercisesResult = {
  cards: CalendarDayCard[] | 'error' | null;
  // 取得失敗時にユーザー操作で再取得するための関数（同じ日付を選択したままでは
  // daySessionIdsKeyが変化せず自動では再実行されないため、明示的な再実行手段が要る）
  retry: () => void;
};

// 選択中の日付に開始した完了済みセッション（複数セッションがあれば全て）の種目カードを、
// 自己ベスト判定つきでまとめて返す。cards: null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）
// （session-history-load-view.tsxと同じ三値管理）。
// 対象日のセッション自体はuseWorkoutSessions()のlive queryから絞り込むため一覧の増減に追従するが、
// 各カードの中身（種目・セット・自己ベスト）はgetSessionExerciseCards等の一括取得を都度実行する
// 一時点のスナップショットで、live query化はしていない（カレンダーで過去日を見ている間に
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
        const cardsBySession = await Promise.all(daySessionIds.map((id) => getSessionExerciseCards(id)));
        const cards = cardsBySession.flat();

        // 種目ごとに履歴全件を取り、自己ベストのカードidを集める（同じ種目が複数カード
        // あっても履歴取得は種目単位で1回で済ませる）
        const uniqueExerciseIds = [...new Set(cards.map((c) => c.exerciseId))];
        const bestCardIds = new Set<number>();
        await Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => {
            const sample = cards.find((c) => c.exerciseId === exerciseId)!;
            const measurementType = resolveMeasurementType(sample.measurementType);
            // NO_SESSION_TO_EXCLUDE: ここでは「今表示中の記録自身」も自己ベスト比較に含めたい
            // （元々の用途はルーティン編集画面のようにセッション概念が無い場面向けの番兵だが、
            // 「除外セッションなし＝全履歴を対象にする」という意味は今回の用途にもそのまま合致する）
            const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);
            for (const id of computePersonalBestIds(entries, measurementType)) bestCardIds.add(id);
          }),
        );

        if (!cancelled) {
          setResult(cards.map((c) => ({ ...c, isBest: bestCardIds.has(c.workoutSessionExerciseId) })));
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
