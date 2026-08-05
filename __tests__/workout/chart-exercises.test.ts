import { toChartExercises } from '@/lib/workout/chart-exercises';
import type { SessionHistoryCard } from '@/lib/workout/history';

function card(over: Partial<SessionHistoryCard>): SessionHistoryCard {
  return {
    workoutSessionExerciseId: 1,
    exerciseId: 1,
    name: 'ベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    pairedWeights: false,
    sets: [],
    ...over,
  };
}

test('カードの並び順を保ったままグラフ用の形に変換する', () => {
  expect(
    toChartExercises([
      card({ workoutSessionExerciseId: 1, exerciseId: 10, name: 'ベンチプレス' }),
      card({ workoutSessionExerciseId: 2, exerciseId: 11, name: 'ダンベルフライ', pairedWeights: true }),
    ]),
  ).toEqual([
    { exerciseId: 10, name: 'ベンチプレス', measurementType: 'weight_reps', pairedWeights: false },
    { exerciseId: 11, name: 'ダンベルフライ', measurementType: 'weight_reps', pairedWeights: true },
  ]);
});

// 同じ種目を2枚追加している場合（ウォームアップ＋本番）、グラフは種目単位なので同じ絵になる
test('同じ種目のカードが複数あっても1件に畳む（先勝ち）', () => {
  const result = toChartExercises([
    card({ workoutSessionExerciseId: 1, exerciseId: 10, name: 'ベンチプレス' }),
    card({ workoutSessionExerciseId: 2, exerciseId: 10, name: 'ベンチプレス' }),
    card({ workoutSessionExerciseId: 3, exerciseId: 11, name: 'ディップス' }),
  ]);

  expect(result.map((e) => e.exerciseId)).toEqual([10, 11]);
});

test('カードが無ければ空配列', () => {
  expect(toChartExercises([])).toEqual([]);
});
