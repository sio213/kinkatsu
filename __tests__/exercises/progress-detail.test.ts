import type { ProgressPoint, ProgressSet } from '@/lib/exercises/progress';
import {
  buildDetailSetRows,
  COLLAPSE_THRESHOLD,
  completedSets,
  hiddenSetCount,
} from '@/lib/exercises/progress-detail';

function makeSet(setNumber: number, weight: number, completed = true): ProgressSet {
  return {
    sessionId: 1,
    workoutSessionExerciseId: 1,
    setNumber,
    weight,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: completed ? 1 : null,
  };
}

/** weights の中で最大のセットをベストにした1点を作る */
function makePoint(weights: number[], completedFlags?: boolean[]): ProgressPoint {
  const sets = weights.map((w, i) => makeSet(i + 1, w, completedFlags?.[i] ?? true));
  const best = sets.filter((s) => s.completedAt != null).reduce((a, b) => (b.weight! > a.weight! ? b : a));
  return { dateKey: 0, startedAt: 0, value: best.weight!, best, sets };
}

describe('buildDetailSetRows', () => {
  test('通し番号は配列の位置で振る（同じ日に複数カードがあるとsetNumberが1から振り直されるため）', () => {
    const point = makePoint([60, 65, 60]);
    // 2枚目のカードのセットとして setNumber が 1 に戻っている状況を作る
    point.sets[2] = { ...point.sets[2], workoutSessionExerciseId: 2, setNumber: 1 };
    expect(buildDetailSetRows(point, false).map((r) => r.position)).toEqual([1, 2, 3]);
  });

  test('ベストのセットにだけ印が付く', () => {
    const rows = buildDetailSetRows(makePoint([60, 75, 70]), false);
    expect(rows.map((r) => r.isBest)).toEqual([false, true, false]);
  });

  test('7セット以下は全件出す（畳んでも隠れるのが1〜2行だけでタップのコストに見合わない）', () => {
    for (const count of [1, 5, 6, 7]) {
      const point = makePoint(new Array(count).fill(60));
      expect(buildDetailSetRows(point, false)).toHaveLength(count);
      expect(hiddenSetCount(point, false)).toBe(0);
    }
  });

  test('8セット以上はベストを含む連続5件に畳む', () => {
    // 8セット目がベスト
    const point = makePoint([60, 60, 60, 60, 60, 60, 60, 80]);
    const rows = buildDetailSetRows(point, false);
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.isBest)).toBe(true);
    expect(hiddenSetCount(point, false)).toBe(3);
  });

  test('ベストが先頭にあっても窓に必ず含まれる', () => {
    const point = makePoint([80, 60, 60, 60, 60, 60, 60, 60, 60, 60]);
    const rows = buildDetailSetRows(point, false);
    expect(rows[0].isBest).toBe(true);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
  });

  test('ベストが末尾にあっても窓に必ず含まれる', () => {
    const point = makePoint([60, 60, 60, 60, 60, 60, 60, 60, 60, 80]);
    const rows = buildDetailSetRows(point, false);
    expect(rows[rows.length - 1].isBest).toBe(true);
    expect(rows.map((r) => r.position)).toEqual([6, 7, 8, 9, 10]);
  });

  test('ベストが中ほどなら窓の中央に来る', () => {
    const point = makePoint([60, 60, 60, 60, 80, 60, 60, 60, 60, 60]);
    const rows = buildDetailSetRows(point, false);
    expect(rows.map((r) => r.position)).toEqual([3, 4, 5, 6, 7]);
    expect(rows[2].isBest).toBe(true);
  });

  test('展開すれば全件出る', () => {
    const point = makePoint(new Array(10).fill(60).map((v, i) => (i === 0 ? 80 : v)));
    expect(buildDetailSetRows(point, true)).toHaveLength(10);
    expect(hiddenSetCount(point, true)).toBe(0);
  });

  test('畳む閾値は8セット', () => {
    expect(COLLAPSE_THRESHOLD).toBe(8);
    expect(buildDetailSetRows(makePoint(new Array(7).fill(60)), false)).toHaveLength(7);
    expect(buildDetailSetRows(makePoint(new Array(8).fill(60)), false)).toHaveLength(5);
  });
});

describe('completedSets', () => {
  test('✓未確定のセットは前回比の計算対象から外す（自己ベスト判定と基準を揃える）', () => {
    const point = makePoint([60, 70, 65], [true, true, false]);
    expect(completedSets(point)).toHaveLength(2);
  });

  test('進行中でも✓済みのセットは残る', () => {
    const point = makePoint([60, 70], [true, false]);
    expect(completedSets(point).map((s) => s.weight)).toEqual([60]);
  });
});

describe('進行中セッション', () => {
  test('✓未確定のセットも行としては並ぶ（「未実施」として見せるため）', () => {
    const point = makePoint([60, 70, 65], [true, true, false]);
    const rows = buildDetailSetRows(point, false);
    expect(rows).toHaveLength(3);
    expect(rows[2].set.completedAt).toBeNull();
  });
});
