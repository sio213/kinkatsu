import {
  CHART_HEIGHT,
  computeChartLayout,
  estimateTextWidth,
  findBestIndex,
  findNearestPointIndex,
  formatTooltipDate,
  pickMarkerIndices,
  pickXTickIndices,
  placeBestChip,
  placeTooltip,
  starPoints,
} from '@/lib/exercises/chart-layout';
import type { ProgressPoint, ProgressUnit } from '@/lib/exercises/progress';

const KG: ProgressUnit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' };
const KM: ProgressUnit = { label: 'km', step: 2.5, minRange: 4, integerOnly: false, auxKind: 'none' };

const DAY = 86_400_000;
const BASE = new Date(2026, 3, 12).getTime();

function makePoints(values: number[], stepDays = 7): ProgressPoint[] {
  return values.map((value, i) => {
    const set = {
      sessionId: i + 1,
      workoutSessionExerciseId: i + 1,
      setNumber: 1,
      weight: value,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      completedAt: 1,
    };
    return {
      dateKey: BASE + i * stepDays * DAY,
      startedAt: BASE + i * stepDays * DAY,
      value,
      best: set,
      sets: [set],
    };
  });
}

// デザイン案の標準データ（S3）と同じ14点
const S3 = [60, 60, 62.5, 62.5, 65, 65, 67.5, 65, 67.5, 70, 70, 72.5, 72.5, 75];
const WIDTH = 353;

describe('computeChartLayout', () => {
  test('高さ210pxのうち、上30pxがベストチップの帯・下22pxがX軸ラベル・残りがプロット領域', () => {
    const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
    expect(layout.height).toBe(CHART_HEIGHT);
    expect(layout.top).toBe(30);
    expect(layout.bottom).toBe(188);
  });

  test('すべての点がプロット領域の内側に収まる', () => {
    const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
    for (const p of layout.points) {
      expect(p.y).toBeGreaterThan(layout.top);
      expect(p.y).toBeLessThan(layout.bottom);
      expect(p.x).toBeGreaterThanOrEqual(layout.left);
      expect(p.x).toBeLessThanOrEqual(layout.right);
    }
  });

  test('値が大きいほど上に描かれる', () => {
    const layout = computeChartLayout(makePoints([60, 70, 65]), KG, WIDTH);
    expect(layout.points[1].y).toBeLessThan(layout.points[0].y);
    expect(layout.points[2].y).toBeGreaterThan(layout.points[1].y);
  });

  test('X座標は実日付に比例する（記録が空いた期間はそのまま余白になる）', () => {
    // 1週・1週・6週の間隔。最後の区間だけ広くなる
    const points = [0, 7, 14, 56].map((offset, i) => makePoints([60 + i], 0)[i]);
    const spaced = points.map((p, i) => ({ ...p, dateKey: BASE + [0, 7, 14, 56][i] * DAY }));
    const layout = computeChartLayout(spaced, KG, WIDTH);
    const gap = (a: number, b: number) => layout.points[b].x - layout.points[a].x;
    expect(gap(0, 1)).toBeCloseTo(gap(1, 2), 5);
    expect(gap(2, 3)).toBeGreaterThan(gap(0, 1) * 5);
  });

  test('点が1つだけなら水平中央に置き、X軸ラベルも中央揃えにする', () => {
    const layout = computeChartLayout(makePoints([60]), KG, WIDTH);
    const center = layout.left + 6 + (layout.right - layout.left - 12) / 2;
    expect(layout.points[0].x).toBeCloseTo(center, 5);
    expect(layout.xTicks).toHaveLength(1);
    expect(layout.xTicks[0].anchor).toBe('middle');
  });

  test('左ガターは3桁の重量で広がる', () => {
    const narrow = computeChartLayout(makePoints([60, 75]), KG, WIDTH).left;
    const wide = computeChartLayout(makePoints([150, 170]), KG, WIDTH).left;
    expect(wide).toBeGreaterThan(narrow);
  });

  test('左ガターは生データの桁数ではなく、実際に描くラベル（丸め後の値＋単位）の幅で決まる', () => {
    // 生データは1桁（3〜7km）でも、目盛りは「10 km」まで伸びる
    const layout = computeChartLayout(makePoints([3, 7]), KM, WIDTH);
    const widest = layout.scale.labelIndices
      .map((i, order) => {
        const label = String(layout.scale.ticks[i]);
        return order === layout.scale.labelIndices.length - 1 ? `${label} km` : label;
      })
      .reduce((a, b) => (estimateTextWidth(a, 9.5) > estimateTextWidth(b, 9.5) ? a : b));
    expect(widest).toBe('10 km');
    expect(layout.left).toBeGreaterThanOrEqual(estimateTextWidth('10 km', 9.5));
    // 生データの最大値「7」だけを基準にしたのでは足りない
    expect(layout.left).toBeGreaterThan(estimateTextWidth('7', 9.5) + 8);
  });
});

describe('X軸ラベル', () => {
  test('等間隔に4つ取る', () => {
    expect(pickXTickIndices(14)).toEqual([0, 4, 9, 13]);
  });

  test('点が少なければ重複を落とす', () => {
    expect(pickXTickIndices(2)).toEqual([0, 1]);
    expect(pickXTickIndices(1)).toEqual([0]);
    expect(pickXTickIndices(0)).toEqual([]);
  });

  test('両端は内側に寄せる', () => {
    const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
    expect(layout.xTicks[0].anchor).toBe('start');
    expect(layout.xTicks[layout.xTicks.length - 1].anchor).toBe('end');
    expect(layout.xTicks[1].anchor).toBe('middle');
  });

  test('1年未満なら「7/23」形式', () => {
    const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
    expect(layout.xTicks[0].label).toMatch(/^\d+\/\d+$/);
  });

  test('1年以上にまたがるなら年を含める（月日だけでは年が分からないため）', () => {
    const layout = computeChartLayout(makePoints([60, 70, 80], 200), KG, WIDTH);
    expect(layout.xTicks[0].label).toMatch(/^\d{4}\/\d+$/);
  });
});

describe('マーカーの間引き', () => {
  test('平均間隔が14px以上なら全点に描く', () => {
    expect(pickMarkerIndices(5, 20)).toEqual([0, 1, 2, 3, 4]);
    expect(pickMarkerIndices(5, 14)).toEqual([0, 1, 2, 3, 4]);
  });

  test('11〜14pxなら1つおき', () => {
    expect(pickMarkerIndices(6, 12)).toEqual([0, 2, 4]);
  });

  test('8〜11pxなら2つおき', () => {
    expect(pickMarkerIndices(7, 9)).toEqual([0, 3, 6]);
  });

  test('8px未満ならマーカーを消して線だけにする', () => {
    expect(pickMarkerIndices(50, 7.9)).toEqual([]);
  });

  test('デザイン案の目安どおり、3ヶ月・週2回（約26点）では間引かれ、6ヶ月（約52点）では消える', () => {
    const layout3m = computeChartLayout(makePoints(new Array(26).fill(60), 3), KG, WIDTH);
    const layout6m = computeChartLayout(makePoints(new Array(52).fill(60), 3), KG, WIDTH);
    expect(layout3m.markerIndices.length).toBeGreaterThan(0);
    expect(layout3m.markerIndices.length).toBeLessThan(26);
    expect(layout6m.markerIndices).toEqual([]);
  });
});

describe('自己ベスト', () => {
  test('最大値の点を選ぶ', () => {
    expect(findBestIndex(makePoints([60, 75, 70]))).toBe(1);
  });

  test('同じ値が複数回あるときは最初に到達した回に付ける', () => {
    expect(findBestIndex(makePoints([60, 75, 70, 75]))).toBe(1);
  });

  test('点が無ければnull', () => {
    expect(findBestIndex([])).toBeNull();
  });

  test('マーカーが間引かれても、ベストの点は描画対象として残る', () => {
    const layout = computeChartLayout(makePoints(new Array(52).fill(60).concat([80]), 3), KG, WIDTH);
    expect(layout.markerIndices).toEqual([]);
    expect(layout.bestIndex).toBe(52);
  });
});

describe('ベストチップの配置', () => {
  test('右肩上がりなら左上に置く', () => {
    const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
    const chip = placeBestChip(layout, KG)!;
    expect(chip.label).toBe('ベスト 75kg');
    expect(chip.x).toBe(layout.left + 6);
    expect(chip.y).toBeLessThan(layout.top + 30);
  });

  test('右肩下がりで左上に線と点が通るときは右上に逃がす', () => {
    // デザイン案Y-3（ベストが期間の先頭にある）
    const layout = computeChartLayout(makePoints([85, 82.5, 80, 80, 77.5, 75, 72.5, 72.5, 70]), KG, WIDTH);
    const chip = placeBestChip(layout, KG)!;
    expect(chip.x).toBeGreaterThan(layout.left + 6);
    expect(chip.x + chip.width).toBeLessThanOrEqual(layout.right - 6);
  });

  test('チップは常にプロットの横幅に収まる', () => {
    for (const values of [S3, [85, 70], [150, 170], [7.5, 12.5]]) {
      const layout = computeChartLayout(makePoints(values), KG, WIDTH);
      const chip = placeBestChip(layout, KG)!;
      expect(chip.x).toBeGreaterThanOrEqual(layout.left);
      expect(chip.x + chip.width).toBeLessThanOrEqual(layout.right);
    }
  });

  test('単位に応じたラベルになる', () => {
    const layout = computeChartLayout(makePoints([3, 7]), KM, WIDTH);
    expect(placeBestChip(layout, KM)!.label).toBe('ベスト 7km');
  });

  test('点が無ければチップを出さない', () => {
    expect(placeBestChip(computeChartLayout([], KG, WIDTH), KG)).toBeNull();
  });
});

describe('文字幅の見積もり', () => {
  test('全角は半角の約1.7倍として数える', () => {
    expect(estimateTextWidth('ベスト', 10)).toBeCloseTo(30, 5);
    expect(estimateTextWidth('75kg', 10)).toBeCloseTo(23.2, 5);
  });
});

describe('starPoints', () => {
  test('星は10頂点で、外接半径と内接半径が交互になる', () => {
    const points = starPoints(0, 0, 10, 4).split(' ');
    expect(points).toHaveLength(10);
    // 先頭の頂点は真上（外接半径ぶん上）
    expect(points[0]).toBe('0.00,-10.00');
  });
});

describe('タップ位置から最近傍の点にスナップする', () => {
  const layout = computeChartLayout(makePoints(S3), KG, WIDTH);

  test('点のちょうど上を押せばその点になる', () => {
    expect(findNearestPointIndex(layout, layout.points[5].x)).toBe(5);
  });

  test('点と点の間を押しても、近い方の点にスナップする', () => {
    const between = (layout.points[5].x + layout.points[6].x) / 2;
    expect(findNearestPointIndex(layout, between - 3)).toBe(5);
    expect(findNearestPointIndex(layout, between + 3)).toBe(6);
  });

  test('プロットの外まで指がはみ出しても両端の点に丸める', () => {
    expect(findNearestPointIndex(layout, -100)).toBe(0);
    expect(findNearestPointIndex(layout, WIDTH + 100)).toBe(S3.length - 1);
  });

  test('点が無ければnull', () => {
    expect(findNearestPointIndex(computeChartLayout([], KG, WIDTH), 100)).toBeNull();
  });
});

describe('ツールチップ', () => {
  const layout = computeChartLayout(makePoints(S3), KG, WIDTH);
  const texts = { date: '7/23', value: '75', unit: 'kg', aux: '×7' };

  test('基本は選択中の点の真上に、中央揃えで置く', () => {
    const tip = placeTooltip(layout, 5, texts, null)!;
    expect(tip.y + tip.height).toBeLessThan(layout.points[5].y);
    expect(tip.x + tip.width / 2).toBeCloseTo(layout.points[5].x, 5);
  });

  test('端の点でもプロットの内側に収める', () => {
    for (const index of [0, S3.length - 1]) {
      const tip = placeTooltip(layout, index, texts, null)!;
      expect(tip.x).toBeGreaterThanOrEqual(layout.left);
      expect(tip.x + tip.width).toBeLessThanOrEqual(layout.right);
    }
  });

  test('補助情報があるぶんだけ横に広がる', () => {
    const withAux = placeTooltip(layout, 5, texts, null)!;
    const withoutAux = placeTooltip(layout, 5, { ...texts, aux: null }, null)!;
    expect(withAux.width).toBeGreaterThan(withoutAux.width);
  });

  test('ベストチップと重なるときは、上のまま横（右）に逃がす', () => {
    const index = 5;
    const natural = placeTooltip(layout, index, texts, null)!;
    // ちょうど重なる位置にベストチップがある状況を作る
    const chip = { x: natural.x, y: natural.y, width: 80, height: 19, label: 'ベスト 75kg' };
    const tip = placeTooltip(layout, index, texts, chip)!;
    expect(tip.y).toBe(natural.y);
    expect(tip.x).toBeGreaterThanOrEqual(chip.x + chip.width);
    expect(tip.x + tip.width).toBeLessThanOrEqual(layout.right);
  });

  test('左右どちらにも逃げ場が無い場合だけ点の下に出す', () => {
    const index = 5;
    const natural = placeTooltip(layout, index, texts, null)!;
    const chip = {
      x: layout.left,
      y: natural.y,
      width: layout.right - layout.left,
      height: 19,
      label: 'ベスト 75kg',
    };
    const tip = placeTooltip(layout, index, texts, chip)!;
    expect(tip.y).toBeGreaterThan(layout.points[index].y);
    expect(tip.y + tip.height).toBeLessThanOrEqual(layout.bottom);
  });

  test('点が無ければnull', () => {
    expect(placeTooltip(layout, 99, texts, null)).toBeNull();
  });
});

describe('ツールチップの日付', () => {
  test('1年未満なら月日だけ', () => {
    expect(formatTooltipDate(new Date(2026, 6, 23).getTime(), false)).toBe('7/23');
  });

  test('1年以上にまたがるなら年を含める', () => {
    expect(formatTooltipDate(new Date(2025, 9, 6).getTime(), true)).toBe('2025/10/6');
  });
});
