import { useExercises } from '@/hooks/use-exercises';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import {
  computePersonalBestIds,
  getExerciseHistoryEntries,
  NO_SESSION_TO_EXCLUDE,
  type HistorySetValues,
} from '@/lib/workout/history';
import { useCallback, useEffect, useState } from 'react';

export type ScheduledExercisePreviewCard = {
  exerciseId: number;
  name: string;
  category: string;
  source: string;
  slug: string | null;
  measurementType: string;
  // その種目を直近に実施した記録の確定セット。一度も実施したことが無ければ空配列
  // （まだ予定を実施していないため、このカード自身のセットは存在しない。過去の記録カード
  // (CalendarExerciseCard)と同じ見た目で「前回の参考値」を見せる、@ユーザー指摘2026-07-20）
  sets: HistorySetValues[];
  // 直近の実施が自己ベストかどうか。前回比較(comparison)は「今回の実施」が無いと成立しない
  // 概念のため、このプレビューでは扱わない（呼び出し側は常にnullを渡す）
  isBest: boolean;
};

export type UseScheduledExercisePreviewCardsResult = {
  cards: ScheduledExercisePreviewCard[] | 'error' | null;
  retry: () => void;
};

// 直接追加予定（routineId===null）の選択日パネル表示用。use-calendar-day-exercises.tsと同じ
// 「履歴全件を取って自己ベストを判定する」考え方を、実施済みセッションではなくexerciseIds
// （まだ実施していない予定の種目一覧）に対して適用する。種目メタ情報はuseExercises()の
// live queryから引き、実施履歴（直近の記録・自己ベスト判定）だけを都度取得するスナップショットにする
// （use-calendar-day-exercises.tsと同じ理由でlive query化はしていない）
export function useScheduledExercisePreviewCards(exerciseIds: number[]): UseScheduledExercisePreviewCardsResult {
  const { exercises } = useExercises();
  const idsKey = exerciseIds.join(',');

  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);
  const [result, setResult] = useState<ScheduledExercisePreviewCard[] | 'error' | null>(null);

  useEffect(() => {
    if (exerciseIds.length === 0) {
      setResult([]);
      return;
    }

    let cancelled = false;
    setResult(null);

    (async () => {
      try {
        const entriesByExerciseId = new Map(
          await Promise.all(
            exerciseIds.map(async (exerciseId) => {
              const entries = await getExerciseHistoryEntries(exerciseId, NO_SESSION_TO_EXCLUDE);
              return [exerciseId, entries] as const;
            }),
          ),
        );

        const cards = exerciseIds.flatMap((exerciseId) => {
          const exercise = exercises.find((e) => e.id === exerciseId);
          // 削除済み種目を指す予定行（安全網、通常はexercisesのonDelete:'restrict'で発生しない）は対象外
          if (!exercise) return [];

          const entries = entriesByExerciseId.get(exerciseId) ?? [];
          const measurementType = resolveMeasurementType(exercise.measurementType);
          const bestIds = computePersonalBestIds(entries, measurementType);
          // entriesはgetExerciseHistoryEntriesの時点でdesc(startedAt)済み＝先頭が直近の実施
          const latest = entries[0];

          return [
            {
              exerciseId,
              name: exercise.name,
              category: exercise.category,
              source: exercise.source,
              slug: exercise.slug,
              measurementType: exercise.measurementType,
              sets: latest?.sets ?? [],
              isBest: latest != null && bestIds.has(latest.workoutSessionExerciseId),
            },
          ];
        });

        if (!cancelled) setResult(cards);
      } catch (e) {
        console.error('[scheduled exercise preview cards]', e);
        if (!cancelled) setResult('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, retryToken, exercises]);

  return { cards: result, retry };
}
