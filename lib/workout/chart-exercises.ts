import type { SessionHistoryCard } from '@/lib/workout/history';

/** 完了サマリーのグラフが1種目を描くのに必要な情報 */
export type SummaryChartExercise = {
  exerciseId: number;
  name: string;
  measurementType: string;
  pairedWeights: boolean;
};

/**
 * セッションの種目カードを、グラフの切り替え対象へ畳む。
 *
 * 同じ種目を1セッションに2枚追加している場合（ウォームアップ＋本番）カードは2件になるが、
 * グラフは種目単位の推移なので2枚とも同じ絵になる。種目idで先勝ちにして1件にまとめる。
 * 並びはカードの順（orderIndex）をそのまま保つ
 */
export function toChartExercises(cards: SessionHistoryCard[]): SummaryChartExercise[] {
  const byExerciseId = new Map<number, SummaryChartExercise>();
  for (const c of cards) {
    if (byExerciseId.has(c.exerciseId)) continue;
    byExerciseId.set(c.exerciseId, {
      exerciseId: c.exerciseId,
      name: c.name,
      measurementType: c.measurementType,
      pairedWeights: c.pairedWeights,
    });
  }
  return [...byExerciseId.values()];
}
