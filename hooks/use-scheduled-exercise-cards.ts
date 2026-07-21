import { useScheduledWorkoutExercises } from '@/hooks/use-scheduled-workout-exercises';
import { getExerciseHistoryEntries, NO_SESSION_TO_EXCLUDE, type HistorySetValues } from '@/lib/workout/history';
import { hasAnyValue } from '@/lib/workout/set-values';
import type { SetLike } from '@/lib/workout/set-format';
import { useCallback, useEffect, useMemo, useState } from 'react';

// CalendarExerciseCardが受け取る形（HistorySetValuesが持つsetNumberは表示に不要なため含めない）
export type ScheduledExerciseCardSet = SetLike & { completedAt: number | null };

export type ScheduledExerciseCard = {
  // 同じ種目を複数回この予定に追加できる（session/routineと同じ仕様、
  // app/calendar/schedule-workout-add-exercise.tsxは既追加種目を除外していない）ため、
  // React keyや識別に使うのはexerciseIdではなくscheduledWorkoutExerciseIdにする
  // （@reviewer指摘: exerciseIdキーだと重複時にkey衝突・カード取り違えが起きる）
  scheduledWorkoutExerciseId: number;
  exerciseId: number;
  name: string;
  category: string;
  source: string;
  slug: string | null;
  measurementType: string;
  // この予定に設定済みの目標セット(scheduledWorkoutSets)があればそれを優先して表示し、まだ
  // 何も設定していない種目だけ直近の実施記録を参考値として表示する。「開始」ボタンを押した
  // ときのプリフィル優先順位（目標セット→前回の実施記録、lib/workout/session.ts）と表示を
  // 揃えることで、目標セットを編集して戻ってもこのカードに反映されない問題
  // （@ユーザー指摘2026-07-21）を解消する
  sets: ScheduledExerciseCardSet[];
};

export type UseScheduledExerciseCardsResult = {
  cards: ScheduledExerciseCard[] | 'error' | null;
  retry: () => void;
};

// カレンダーの「直接追加」予定の選択日パネル表示用（DirectScheduleExerciseGroup）。種目一覧・
// 目標セットはuseScheduledWorkoutExercisesのlive queryにそのまま乗るため、目標セットの編集は
// 即座にこのカードへ反映される。目標セットが未設定の種目だけ、履歴（直近の実施記録）を都度
// 取得するスナップショットとして補う（use-calendar-day-exercises.tsと同じ理由でlive query化は
// していない。実施履歴自体はこの予定の編集操作では変化しないため）
export function useScheduledExerciseCards(scheduledWorkoutId: number): UseScheduledExerciseCardsResult {
  const exercises = useScheduledWorkoutExercises(scheduledWorkoutId);

  const idsNeedingHistory = useMemo(
    // 同じ種目が複数回予定に入っていると重複したexerciseIdが並びうるため、履歴取得の冗長な
    // 発行を避けるためSetで一意化する（@reviewer指摘。結果はexerciseId単位のMapで統合される
    // ため表示上のバグは無かったが、DBアクセス回数が種目の重複数分だけ無駄に増えていた）
    () => [...new Set(exercises.filter((e) => !e.sets.some(hasAnyValue)).map((e) => e.exerciseId))],
    [exercises],
  );
  const idsKey = idsNeedingHistory.join(',');

  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);
  const [historyByExerciseId, setHistoryByExerciseId] = useState<Map<number, HistorySetValues[]> | 'error' | null>(
    null,
  );

  useEffect(() => {
    if (idsNeedingHistory.length === 0) {
      setHistoryByExerciseId(new Map());
      return;
    }

    let cancelled = false;
    setHistoryByExerciseId(null);

    (async () => {
      // 種目ごとに個別にtry/catchする。目標セット設定済みの種目は履歴取得を必要としないため、
      // 一部の種目の履歴取得だけが失敗しても、その種目だけ空セット（履歴フォールバック無し）に
      // 留め、既に表示できる他の種目（目標セット・履歴取得成功分）まで巻き込んでcards全体を
      // 'error'にはしない（@tester指摘: Promise.allの全滅仕様だと無関係な種目まで消えてしまう）
      const entries = await Promise.all(
        idsNeedingHistory.map(async (exerciseId) => {
          try {
            const history = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);
            // entriesはgetExerciseHistoryEntriesの時点でdesc(startedAt)済み＝先頭が直近の実施
            return [exerciseId, history[0]?.sets ?? []] as [number, HistorySetValues[]];
          } catch (e) {
            console.error('[scheduled exercise cards]', e);
            return [exerciseId, []] as [number, HistorySetValues[]];
          }
        }),
      );
      if (!cancelled) setHistoryByExerciseId(new Map(entries));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, retryToken]);

  const cards = useMemo<ScheduledExerciseCard[] | 'error' | null>(() => {
    if (historyByExerciseId === 'error' || historyByExerciseId === null) return historyByExerciseId;

    return exercises.map((e) => {
      const targetSets = e.sets.filter(hasAnyValue);
      const sets: ScheduledExerciseCardSet[] =
        targetSets.length > 0
          ? targetSets.map((s) => ({
              weight: s.weight,
              reps: s.reps,
              durationSeconds: s.durationSeconds,
              distanceMeters: s.distanceMeters,
              // CalendarExerciseCardはconfirmedSets（completedAt!=null）だけを表示に使う
              // （プリフィル用の未確定セット混入防止のガード）。目標セットはこの意味での
              // 「確定」概念を持たないが、表示すべきかどうかは既にhasAnyValueで判定済みのため、
              // ここでは単にそのガードを通す値として0を入れる（他では参照されない）
              completedAt: 0,
            }))
          : (historyByExerciseId.get(e.exerciseId) ?? []);

      return {
        scheduledWorkoutExerciseId: e.scheduledWorkoutExerciseId,
        exerciseId: e.exerciseId,
        name: e.name,
        category: e.category,
        source: e.source,
        slug: e.slug,
        measurementType: e.measurementType,
        sets,
      };
    });
  }, [exercises, historyByExerciseId]);

  return { cards, retry };
}
