import {
  CHART_HEIGHT,
  computeChartLayout,
  estimateTextWidth,
  findNearestPointIndex,
  formatTooltipDate,
  pickMarkerIndices,
  placeBestChip,
  placeTooltip,
  starPoints,
  type ChartLayout,
} from '@/lib/exercises/chart-layout';
import { findPersonalBest, type ProgressPoint, type ProgressUnit } from '@/lib/exercises/progress';

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

/** 記録の間隔がばらつくケース用。BASEからの経過日数で点を作る */
function makePointsOnDays(dayOffsets: number[]): ProgressPoint[] {
  return makePoints(dayOffsets.map((_, i) => 60 + i * 2.5), 0).map((point, i) => ({
    ...point,
    dateKey: BASE + dayOffsets[i] * DAY,
    startedAt: BASE + dayOffsets[i] * DAY,
  }));
}

// デザイン案の標準データ（S3）と同じ14点
const S3 = [60, 60, 62.5, 62.5, 65, 65, 67.5, 65, 67.5, 70, 70, 72.5, 72.5, 75];
const WIDTH = 353;

/** 表示中の点＝全期間の系列（期間で絞っていない）という、ほとんどのケースの前提 */
const layoutOf = (points: ProgressPoint[], unit: ProgressUnit) =>
  computeChartLayout(points, unit, WIDTH, findPersonalBest(points));

describe('computeChartLayout', () => {
  test('高さ210pxのうち、上24pxがツールチップの逃げ場・下22pxがX軸ラベル・残りがプロット領域', () => {
    const layout = layoutOf(makePoints(S3), KG);
    expect(layout.height).toBe(CHART_HEIGHT);
    expect(layout.top).toBe(24);
    expect(layout.bottom).toBe(188);
  });

  test('すべての点がプロット領域の内側に収まる', () => {
    const layout = layoutOf(makePoints(S3), KG);
    for (const p of layout.points) {
      expect(p.y).toBeGreaterThan(layout.top);
      expect(p.y).toBeLessThan(layout.bottom);
      expect(p.x).toBeGreaterThanOrEqual(layout.left);
      expect(p.x).toBeLessThanOrEqual(layout.right);
    }
  });

  test('値が大きいほど上に描かれる', () => {
    const layout = layoutOf(makePoints([60, 70, 65]), KG);
    expect(layout.points[1].y).toBeLessThan(layout.points[0].y);
    expect(layout.points[2].y).toBeGreaterThan(layout.points[1].y);
  });

  test('X座標は実日付に比例する（記録が空いた期間はそのまま余白になる）', () => {
    // 1週・1週・6週の間隔。最後の区間だけ広くなる
    const points = [0, 7, 14, 56].map((offset, i) => makePoints([60 + i], 0)[i]);
    const spaced = points.map((p, i) => ({ ...p, dateKey: BASE + [0, 7, 14, 56][i] * DAY }));
    const layout = layoutOf(spaced, KG);
    const gap = (a: number, b: number) => layout.points[b].x - layout.points[a].x;
    expect(gap(0, 1)).toBeCloseTo(gap(1, 2), 5);
    expect(gap(2, 3)).toBeGreaterThan(gap(0, 1) * 5);
  });

  test('点が1つだけなら水平中央に置き、X軸ラベルも中央揃えにする', () => {
    const layout = layoutOf(makePoints([60]), KG);
    const center = layout.left + 6 + (layout.right - layout.left - 12) / 2;
    expect(layout.points[0].x).toBeCloseTo(center, 5);
    expect(layout.xTicks).toHaveLength(1);
    expect(layout.xTicks[0].anchor).toBe('middle');
  });

  test('左ガターは3桁の重量で広がる', () => {
    const narrow = layoutOf(makePoints([60, 75]), KG).left;
    const wide = layoutOf(makePoints([150, 170]), KG).left;
    expect(wide).toBeGreaterThan(narrow);
  });

  test('左ガターは生データの桁数ではなく、実際に描くラベル（丸め後の値＋単位）の幅で決まる', () => {
    // 生データは1桁（3〜7km）でも、目盛りは「10 km」まで伸びる
    const layout = layoutOf(makePoints([3, 7]), KM);
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
  /** ラベルが実際に占める横方向の区間。アンカーによって基準点の左右どちらに伸びるかが変わる */
  function labelRange(tick: { x: number; label: string; anchor: string }) {
    const width = estimateTextWidth(tick.label, 9.5);
    const start =
      tick.anchor === 'start' ? tick.x : tick.anchor === 'end' ? tick.x - width : tick.x - width / 2;
    return { start, end: start + width };
  }

  test('記録が等間隔なら、X座標を等分した位置に4つ並ぶ', () => {
    const layout = layoutOf(makePoints(S3), KG);
    expect(layout.xTicks.map((t) => t.label)).toEqual(['4/12', '5/10', '6/14', '7/12']);
  });

  test('記録が偏っていても、密集した点にはラベルを出さない', () => {
    // 3日連続で記録した後に4週間空くケース。件数で等分すると先頭3点のラベルが数pxに密集する
    const layout = layoutOf(makePointsOnDays([0, 1, 2, 30]), KG);
    expect(layout.xTicks.map((t) => t.label)).toEqual(['4/12', '5/12']);
  });

  test('どの並びでもラベル同士は重ならない', () => {
    const cases = [
      makePoints(S3),
      makePointsOnDays([0, 1, 2, 30]),
      makePointsOnDays([0, 20, 21, 22]),
      makePointsOnDays([0, 1, 2, 3, 4, 400]),
      makePoints(new Array(52).fill(60), 3),
    ];
    for (const points of cases) {
      const { xTicks } = layoutOf(points, KG);
      for (let i = 1; i < xTicks.length; i++) {
        expect(labelRange(xTicks[i]).start).toBeGreaterThanOrEqual(labelRange(xTicks[i - 1]).end);
      }
    }
  });

  test('間引かれても両端のラベルは必ず残す（期間の始まりと終わりが分かるように）', () => {
    for (const points of [makePoints(S3), makePointsOnDays([0, 1, 2, 30])]) {
      const { xTicks } = layoutOf(points, KG);
      expect(xTicks[0].label).toBe('4/12');
      expect(xTicks[xTicks.length - 1].label).toBe(
        `${new Date(points[points.length - 1].dateKey).getMonth() + 1}/${new Date(points[points.length - 1].dateKey).getDate()}`,
      );
    }
  });

  test('両端は内側に寄せる', () => {
    const layout = layoutOf(makePoints(S3), KG);
    expect(layout.xTicks[0].anchor).toBe('start');
    expect(layout.xTicks[layout.xTicks.length - 1].anchor).toBe('end');
    expect(layout.xTicks[1].anchor).toBe('middle');
  });

  test('点が2つなら両端の2つだけ', () => {
    const layout = layoutOf(makePoints([60, 75]), KG);
    expect(layout.xTicks).toHaveLength(2);
  });

  test('全点が同じ日なら中央に1つだけ', () => {
    const layout = layoutOf(makePoints([60, 65, 70], 0), KG);
    expect(layout.xTicks).toHaveLength(1);
    expect(layout.xTicks[0].anchor).toBe('middle');
  });

  test('1年未満なら「7/23」形式', () => {
    const layout = layoutOf(makePoints(S3), KG);
    expect(layout.xTicks[0].label).toMatch(/^\d+\/\d+$/);
  });

  test('1年以上にまたがるなら年を含める（月日だけでは年が分からないため）', () => {
    const layout = layoutOf(makePoints([60, 70, 80], 200), KG);
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
    const layout3m = layoutOf(makePoints(new Array(26).fill(60), 3), KG);
    const layout6m = layoutOf(makePoints(new Array(52).fill(60), 3), KG);
    expect(layout3m.markerIndices.length).toBeGreaterThan(0);
    expect(layout3m.markerIndices.length).toBeLessThan(26);
    expect(layout6m.markerIndices).toEqual([]);
  });
});

describe('自己ベスト', () => {
  test('マーカーが間引かれても、ベストの点は描画対象として残る', () => {
    const layout = layoutOf(makePoints(new Array(52).fill(60).concat([80]), 3), KG);
    expect(layout.markerIndices).toEqual([]);
    expect(layout.bestIndex).toBe(52);
  });
});

describe('ベストチップの配置', () => {
  test('右肩上がりなら左上に置く', () => {
    const layout = layoutOf(makePoints(S3), KG);
    const chip = placeBestChip(layout, KG)!;
    expect(chip.label).toBe('ベスト 75kg');
    expect(chip.x).toBe(layout.left + 6);
    expect(chip.y).toBeLessThan(layout.top + 30);
  });

  test('右肩下がりで左上に線と点が通るときは右上に逃がす', () => {
    // デザイン案Y-3（ベストが期間の先頭にある）。最上段のグリッド線のすぐ下から下がるので、
    // 既定の置き場所（左上）に先頭の点がかかる
    const layout = layoutOf(makePoints([82.5, 80, 77.5, 75, 72.5, 72.5, 70]), KG);
    const chip = placeBestChip(layout, KG)!;
    expect(chip.x).toBeGreaterThan(layout.left + 6);
    expect(chip.x + chip.width).toBeLessThanOrEqual(layout.right - 6);
  });

  test('チップは常にプロットの横幅に収まる', () => {
    for (const values of [S3, [85, 70], [150, 170], [7.5, 12.5]]) {
      const layout = layoutOf(makePoints(values), KG);
      const chip = placeBestChip(layout, KG)!;
      expect(chip.x).toBeGreaterThanOrEqual(layout.left);
      expect(chip.x + chip.width).toBeLessThanOrEqual(layout.right);
    }
  });

  test('最長のラベル（3桁＋小数の重量に年つきの日付）でも、狭い端末ではみ出さない', () => {
    // 「ベスト 102.5kg・2025/10/6」。日付が付くぶんチップはプロット幅の7割近くを占める
    const best = makePoints([102.5]).map((p) => ({
      ...p,
      dateKey: new Date(2025, 9, 6).getTime(),
      startedAt: new Date(2025, 9, 6).getTime(),
    }))[0];
    for (const width of [280, 320, 353]) {
      const layout = computeChartLayout(makePoints([60, 70, 65]), KG, width, best);
      const chip = placeBestChip(layout, KG)!;
      expect(chip.label + chip.date).toBe('ベスト 102.5kg・2025/10/6');
      expect(chip.x).toBeGreaterThanOrEqual(layout.left);
      expect(chip.x + chip.width).toBeLessThanOrEqual(layout.right);
    }
  });

  test('単位に応じたラベルになる', () => {
    const layout = layoutOf(makePoints([3, 7]), KM);
    expect(placeBestChip(layout, KM)!.label).toBe('ベスト 7km');
  });

  test('点が無ければ、自己ベストがあってもチップを出さない', () => {
    // 期間チップで表示が空になった状態。値だけのチップが宙に浮くのを避ける
    const all = makePoints([80, 70]);
    expect(placeBestChip(computeChartLayout([], KG, WIDTH, findPersonalBest(all)), KG)).toBeNull();
  });
});

describe('自己ベストが表示期間の外にあるとき', () => {
  // 全期間は8点（先頭の80kgが自己ベスト）。表示するのは後ろ3点だけ、という期間の絞り込みを模す
  const all = makePoints([80, 70, 70, 72.5, 70, 67.5, 70, 72.5]);
  const shown = all.slice(-3);
  const layout = () => computeChartLayout(shown, KG, WIDTH, findPersonalBest(all));
  const chipText = (l: ChartLayout) => {
    const chip = placeBestChip(l, KG)!;
    return chip.label + chip.date;
  };

  test('アンバーの点は描かない（表示中の点列に自己ベストの日が無い）', () => {
    expect(layout().bestIndex).toBeNull();
  });

  test('チップは全期間の自己ベストの値を出し続ける（期間内最大に書き換わらない）', () => {
    // 表示中の最大は72.5kgだが、チップは全期間の80kgのまま
    expect(chipText(layout())).toContain('80kg');
    expect(chipText(layout())).not.toContain('72.5');
  });

  test('チップに日付を添える（点が無いまま値だけ浮くのを避ける）', () => {
    expect(chipText(layout())).toBe('ベスト 80kg・4/12');
  });

  test('日付は本体と分けて返す（描画で一段弱くするため）', () => {
    const chip = placeBestChip(layout(), KG)!;
    expect(chip.label).toBe('ベスト 80kg');
    expect(chip.date).toBe('・4/12');
  });

  test('自己ベストが表示期間内にあるときは日付を添えない', () => {
    const chip = placeBestChip(layoutOf(all, KG), KG)!;
    expect(chip.label).toBe('ベスト 80kg');
    expect(chip.date).toBe('');
  });

  test('自己ベストが表示範囲の最初の点と同日なら期間内扱いになる', () => {
    const layoutFromBest = computeChartLayout(all.slice(0, 3), KG, WIDTH, findPersonalBest(all));
    expect(layoutFromBest.bestIndex).toBe(0);
    expect(placeBestChip(layoutFromBest, KG)!.date).toBe('');
  });

  test('同値タイが期間内外にまたがっても、期間内の同値の点にアンバーを付けない', () => {
    // 全期間の先頭2点が同値80kg。自己ベストは先に到達した方（＝期間外）
    const tied = [{ ...all[0] }, { ...all[1], value: 80 }, ...all.slice(2)];
    const layoutTied = computeChartLayout(tied.slice(1), KG, WIDTH, findPersonalBest(tied));
    // 値だけで探すと2点目にアンバーが付いてしまう。日付で突き合わせているので付かない
    expect(layoutTied.bestIndex).toBeNull();
  });

  test('自己ベストが表示中の記録と別の年なら年も出す（4/12だけでは去年と区別できない）', () => {
    const older = [
      { ...all[0], dateKey: new Date(2025, 9, 6).getTime(), startedAt: new Date(2025, 9, 6).getTime() },
      ...all.slice(1),
    ];
    expect(chipText(computeChartLayout(shown, KG, WIDTH, findPersonalBest(older)))).toBe(
      'ベスト 80kg・2025/10/6',
    );
  });

  test('年末年始をまたぐと暦日が近くても年を出す', () => {
    const dec31 = { ...all[0], dateKey: new Date(2025, 11, 31).getTime(), startedAt: new Date(2025, 11, 31).getTime() };
    const jan = makePoints([70, 72.5]).map((p, i) => ({
      ...p,
      dateKey: new Date(2026, 0, 1 + i).getTime(),
      startedAt: new Date(2026, 0, 1 + i).getTime(),
    }));
    expect(chipText(computeChartLayout(jan, KG, WIDTH, dec31))).toBe('ベスト 80kg・2025/12/31');
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
  const layout = layoutOf(makePoints(S3), KG);

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
    expect(findNearestPointIndex(layoutOf([], KG), 100)).toBeNull();
  });
});

describe('ツールチップ', () => {
  const layout = layoutOf(makePoints(S3), KG);
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
    const chip = { x: natural.x, y: natural.y, width: 80, height: 19, label: 'ベスト 75kg', date: '' };
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
      date: '',
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
