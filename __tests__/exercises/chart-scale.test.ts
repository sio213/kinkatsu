import { computeChartScale, formatTickValue, pickLabelIndices } from '@/lib/exercises/chart-scale';
import type { ProgressUnit } from '@/lib/exercises/progress';

const KG: ProgressUnit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' };
const REPS: ProgressUnit = { label: '回', step: 5, minRange: 5, integerOnly: true, auxKind: 'sets' };
const SECONDS: ProgressUnit = { label: '秒', step: 10, minRange: 20, integerOnly: true, auxKind: 'sets' };
const KM: ProgressUnit = { label: 'km', step: 2.5, minRange: 4, integerOnly: false, auxKind: 'none' };

const labelsOf = (values: number[], unit: ProgressUnit) => {
  const scale = computeChartScale(values, unit);
  return scale.labelIndices.map((i) => scale.ticks[i]);
};

// デザイン案「要相談1：縦軸のスケールと目盛り（採用形＋データパターン11種）」のY-1〜Y-11を
// そのままテストケースにしている。デザイン案が本文で明示している結論（Y-1は6本・ラベル3つ、
// Y-7は25kg刻みで25/75/125、Y-9は10kgへ自動で上がる、Y-10は2.5kgへ落とす）が崩れないようにする
describe('computeChartScale: デザイン案のデータパターン11種', () => {
  test('Y-1 標準的なデータは5kg刻み・6本・ラベルは1つおきに3つ', () => {
    const scale = computeChartScale([60, 60, 62.5, 62.5, 65, 65, 67.5, 65, 67.5, 70, 70, 72.5, 72.5, 75], KG);
    expect(scale.step).toBe(5);
    expect(scale.ticks).toEqual([55, 60, 65, 70, 75, 80]);
    expect(scale.labelIndices.map((i) => scale.ticks[i])).toEqual([55, 65, 75]);
  });

  test('Y-2 変化が小さくても最小レンジ10kgを確保する（差を拡大して見せない）', () => {
    const scale = computeChartScale([72.5, 72.5, 73, 73.5, 74, 74.5, 75], KG);
    expect(scale.ticks).toEqual([70, 75, 80]);
    // データ幅は2.5kgしかないが、窓は10kg
    expect(scale.ticks[scale.ticks.length - 1] - scale.ticks[0]).toBe(10);
  });

  test('Y-3 右肩下がりでも同じ刻みで窓を取る', () => {
    expect(computeChartScale([85, 82.5, 80, 80, 77.5, 75, 72.5, 72.5, 70], KG).ticks).toEqual([
      65, 70, 75, 80, 85, 90,
    ]);
  });

  test('Y-4 全点が同じ値なら最小レンジがそのまま窓になる', () => {
    expect(computeChartScale([70, 70, 70, 70, 70, 70, 70], KG).ticks).toEqual([65, 70, 75]);
  });

  test('Y-5 2件でも成立する', () => {
    expect(computeChartScale([65, 72.5], KG).ticks).toEqual([60, 65, 70, 75]);
  });

  test('Y-6 外れ値があると、その1点に合わせて刻みが上がる', () => {
    const scale = computeChartScale([60, 62.5, 62.5, 65, 90, 65, 67.5, 67.5], KG);
    expect(scale.step).toBe(10);
    expect(scale.ticks).toEqual([50, 60, 70, 80, 90, 100]);
  });

  test('Y-7 レンジが広いと刻みが段階的に上がり、目盛りはきりのいい値のまま', () => {
    const scale = computeChartScale([30, 45, 60, 72.5, 85, 95, 102.5], KG);
    expect(scale.step).toBe(25);
    expect(scale.labelIndices.map((i) => scale.ticks[i])).toEqual([25, 75, 125]);
  });

  test('Y-8 間隔がまばらでも縦軸の決め方は変わらない（X軸だけの話）', () => {
    expect(computeChartScale([60, 62.5, 65, 67.5, 70], KG).ticks).toEqual([55, 60, 65, 70, 75]);
  });

  test('Y-9 3桁の重量は刻みが自動で10kgに上がる', () => {
    const scale = computeChartScale([150, 155, 157.5, 160, 162.5, 165, 167.5, 170], KG);
    expect(scale.step).toBe(10);
    expect(scale.ticks).toEqual([140, 150, 160, 170, 180]);
  });

  test('Y-10 軽い重量は刻みを2.5kgまで落とす（5kg刻みだと線が3本しか引けない）', () => {
    const scale = computeChartScale([7.5, 8, 9, 10, 10, 11, 12, 12.5], KG);
    expect(scale.step).toBe(2.5);
    expect(scale.ticks).toEqual([5, 7.5, 10, 12.5, 15]);
    // 刻みを落としても0起点にはしない
    expect(scale.ticks[0]).toBeGreaterThan(0);
  });

  test('Y-11 停滞のあとに更新があるデータ', () => {
    expect(computeChartScale([70, 72.5, 72.5, 72.5, 72.5, 72.5, 72.5, 75], KG).ticks).toEqual([
      65, 70, 75, 80,
    ]);
  });
});

describe('computeChartScale: 0起点にしない', () => {
  test('データが正の範囲にあるかぎり下端は0より上に保つ', () => {
    for (const values of [[60, 75], [7.5, 12.5], [150, 170], [30, 102.5]]) {
      expect(computeChartScale(values, KG).ticks[0]).toBeGreaterThan(0);
    }
  });

  test('すべての点が上端・下端の線の内側に収まる', () => {
    const values = [60, 62.5, 65, 67.5, 70, 72.5, 75];
    const scale = computeChartScale(values, KG);
    expect(scale.ticks[0]).toBeLessThanOrEqual(Math.min(...values));
    expect(scale.ticks[scale.ticks.length - 1]).toBeGreaterThanOrEqual(Math.max(...values));
  });

  test('描画範囲は上下とも目盛りの外側に広がる（点が線に接しない）', () => {
    const scale = computeChartScale([60, 75], KG);
    expect(scale.min).toBeLessThan(scale.ticks[0]);
    expect(scale.max).toBeGreaterThan(scale.ticks[scale.ticks.length - 1]);
  });
});

describe('computeChartScale: 単位ごとの刻み', () => {
  test('回数は整数の刻みだけを使う', () => {
    const scale = computeChartScale([8, 9, 10, 11, 12, 13, 14, 16], REPS);
    expect(Number.isInteger(scale.step)).toBe(true);
    expect(scale.ticks.every(Number.isInteger)).toBe(true);
  });

  test('秒も整数の刻み（2.5秒のような目盛りにしない）', () => {
    const scale = computeChartScale([30, 35, 40, 40, 50, 55, 60, 70], SECONDS);
    expect(scale.ticks).toEqual([20, 40, 60, 80]);
  });

  test('距離は2.5km刻みで小数の目盛りが出る', () => {
    const scale = computeChartScale([3, 3.5, 4, 4, 5, 5.5, 6, 7], KM);
    expect(scale.step).toBe(2.5);
    expect(scale.ticks).toEqual([2.5, 5, 7.5, 10]);
  });

  test('2.5刻みを積み上げても浮動小数の誤差が残らない', () => {
    const scale = computeChartScale([7.5, 12.5], KG);
    for (const tick of scale.ticks) {
      expect(String(tick)).not.toMatch(/0000|9999/);
    }
  });
});

describe('computeChartScale: 端のケース', () => {
  test('記録が無くても枠を描けるスケールを返す', () => {
    const scale = computeChartScale([], KG);
    expect(scale.ticks).toHaveLength(3);
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  test('1点だけでも最小レンジぶんの窓を取る', () => {
    const scale = computeChartScale([60], KG);
    expect(scale.ticks[scale.ticks.length - 1] - scale.ticks[0]).toBeGreaterThanOrEqual(10);
  });
});

describe('pickLabelIndices', () => {
  test('線が4本以下なら全段に数字を出す', () => {
    expect(pickLabelIndices(3)).toEqual([0, 1, 2]);
    expect(pickLabelIndices(4)).toEqual([0, 1, 2, 3]);
  });

  test('線が5本以上なら1つおきに間引く', () => {
    expect(pickLabelIndices(5)).toEqual([0, 2, 4]);
    expect(pickLabelIndices(6)).toEqual([0, 2, 4]);
  });
});

describe('formatTickValue', () => {
  test('整数は小数点を出さず、小数は第1位まで', () => {
    expect(formatTickValue(70)).toBe('70');
    expect(formatTickValue(72.5)).toBe('72.5');
    expect(formatTickValue(10.17)).toBe('10.2');
  });
});
