import { computeChartLayout, placeBestChip } from '@/lib/exercises/chart-layout';
import { computeChartScale, formatTickLabel, formatTickValue } from '@/lib/exercises/chart-scale';
import { estimateOneRepMax, ONE_REP_MAX_REP_LIMIT } from '@/lib/exercises/one-rep-max';
import {
  availableProgressMetrics,
  buildProgressSeries,
  buildRecordDays,
  progressMetricLabel,
  resolveChartMeasurementType,
  type ProgressSetRow,
} from '@/lib/exercises/progress';

// 2026-07-01 から1日ずつ
function day(index: number): number {
  return new Date(2026, 6, 1 + index).getTime();
}

function row(
  dayIndex: number,
  setNumber: number,
  values: { weight?: number | null; reps?: number | null; durationSeconds?: number | null; distanceMeters?: number | null },
  completed = true,
): ProgressSetRow {
  return {
    sessionId: dayIndex + 1,
    workoutSessionExerciseId: dayIndex + 1,
    startedAt: day(dayIndex),
    setNumber,
    weight: values.weight ?? null,
    reps: values.reps ?? null,
    durationSeconds: values.durationSeconds ?? null,
    distanceMeters: values.distanceMeters ?? null,
    completedAt: completed ? day(dayIndex) + 1000 : null,
  };
}

describe('estimateOneRepMax', () => {
  test('Epley式で推定する', () => {
    // 100 × (1 + 5/30) = 116.67 → 小数第1位
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
    expect(estimateOneRepMax(60, 10)).toBe(80);
  });

  test('1回は実測とみなして重量をそのまま返す（Epley素通しだと3.3%水増しされる）', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  test('上限を超えるレップは除外する（クランプしない）', () => {
    expect(estimateOneRepMax(100, ONE_REP_MAX_REP_LIMIT)).toBe(140);
    expect(estimateOneRepMax(100, ONE_REP_MAX_REP_LIMIT + 1)).toBeNull();
    expect(estimateOneRepMax(50, 25)).toBeNull();
  });

  test('重量が無い・0以下のセットは対象外', () => {
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, null)).toBeNull();
  });
});

describe('availableProgressMetrics / progressMetricLabel', () => {
  test('計測タイプごとに選べる指標と文言が変わる', () => {
    expect(availableProgressMetrics('weight_reps')).toEqual(['best', 'total', 'e1rm']);
    expect(availableProgressMetrics('reps')).toEqual(['best', 'total']);
    expect(availableProgressMetrics('time')).toEqual(['best', 'total']);
    expect(availableProgressMetrics('distance_time')).toEqual(['best', 'total']);
    // 加重ホールドは合計も推定1RMも定義できない。1件しか無いのでチップ列自体を出さない
    expect(availableProgressMetrics('weight_time')).toEqual(['best']);
  });

  test('合計の語は計測タイプで変わり、1RMは必ず「推定」を伴う', () => {
    expect(progressMetricLabel('weight_reps', 'total')).toBe('総重量');
    expect(progressMetricLabel('reps', 'total')).toBe('合計回数');
    expect(progressMetricLabel('time', 'total')).toBe('合計時間');
    expect(progressMetricLabel('distance_time', 'total')).toBe('合計距離');
    expect(progressMetricLabel('weight_reps', 'e1rm')).toBe('推定1RM');
    expect(progressMetricLabel('reps', 'e1rm')).toBeNull();
  });
});

describe('buildProgressSeries: 総重量', () => {
  test('その日の全セットを足す。同じ日の複数セッションも合算する', () => {
    const rows: ProgressSetRow[] = [
      row(0, 1, { weight: 60, reps: 10 }),
      row(0, 2, { weight: 60, reps: 10 }),
      // 同じ日の別カード（ウォームアップ用と本番用など）も区別せず足す
      { ...row(0, 1, { weight: 40, reps: 12 }), workoutSessionExerciseId: 99 },
    ];
    const { unit, points } = buildProgressSeries('weight_reps', rows, 'total');
    expect(unit.label).toBe('kg');
    // 補助情報は出さない（合計はその日全体の値なので、特定のセットに紐づく情報を添えない）
    expect(unit.auxKind).toBe('none');
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(60 * 10 + 60 * 10 + 40 * 12);
  });

  test('✓未確定のセットは足さない', () => {
    const { points } = buildProgressSeries(
      'weight_reps',
      [row(0, 1, { weight: 50, reps: 10 }), row(0, 2, { weight: 50, reps: 10 }, false)],
      'total',
    );
    expect(points[0].value).toBe(500);
  });

  test('回数種目は合計回数になる', () => {
    const { unit, points } = buildProgressSeries(
      'reps',
      [row(0, 1, { reps: 20 }), row(0, 2, { reps: 15 }), row(0, 3, { reps: 12 })],
      'total',
    );
    expect(unit.label).toBe('回');
    expect(points[0].value).toBe(47);
  });

  test('重量の無いセットは合計から除き、有効なセットが1つも無い日は点を落とす', () => {
    const { points } = buildProgressSeries(
      'weight_reps',
      [
        row(0, 1, { weight: 60, reps: 10 }),
        // 自重でやった日。0kgの谷を作らず、点ごと落とす
        row(1, 1, { weight: 0, reps: 12 }),
        row(2, 1, { weight: 70, reps: 8 }),
      ],
      'total',
    );
    expect(points.map((p) => p.value)).toEqual([600, 560]);
  });
});

describe('buildProgressSeries: 推定1RM', () => {
  test('その日の全セットで計算して最大値を採る', () => {
    const { unit, points } = buildProgressSeries(
      'weight_reps',
      [row(0, 1, { weight: 100, reps: 3 }), row(0, 2, { weight: 90, reps: 8 })],
      'e1rm',
    );
    expect(unit.label).toBe('kg');
    // 100×(1+3/30)=110 と 90×(1+8/30)=114 → 後者が勝つ（レップレンジをまたいだ比較ができる）
    expect(points[0].value).toBe(114);
  });

  test('13回以上のセットしか無い日は点を落とす（偽の高値を作らない）', () => {
    const { points } = buildProgressSeries(
      'weight_reps',
      [row(0, 1, { weight: 80, reps: 5 }), row(1, 1, { weight: 50, reps: 25 })],
      'e1rm',
    );
    expect(points).toHaveLength(1);
    expect(points[0].dateKey).toBe(day(0));
  });

  test('ベスト系列とは点の数が変わりうる（空状態の判定に使わないこと）', () => {
    const rows = [row(0, 1, { weight: 80, reps: 5 }), row(1, 1, { weight: 50, reps: 25 })];
    expect(buildProgressSeries('weight_reps', rows, 'best').points).toHaveLength(2);
    expect(buildProgressSeries('weight_reps', rows, 'e1rm').points).toHaveLength(1);
  });
});

describe('weight <= 0 は未入力と同じ扱い', () => {
  test('ベスト指標でも0kgの点を立てない（縦軸のスケールが潰れるため）', () => {
    const { points } = buildProgressSeries('weight_reps', [
      row(0, 1, { weight: 0, reps: 10 }),
      row(1, 1, { weight: 10, reps: 10 }),
      row(2, 1, { weight: 20, reps: 10 }),
    ]);
    expect(points.map((p) => p.value)).toEqual([10, 20]);
  });
});

describe('resolveChartMeasurementType', () => {
  test('重量を1度も記録していない加重種目は reps 種目として描く', () => {
    const rows = [row(0, 1, { reps: 10 }), row(1, 1, { weight: 0, reps: 12 })];
    expect(resolveChartMeasurementType('weight_reps', rows)).toBe('reps');

    // グラフが空にならず、最高回数の推移が出る
    const { unit, points } = buildProgressSeries('reps', rows, 'best');
    expect(unit.label).toBe('回');
    expect(points.map((p) => p.value)).toEqual([10, 12]);
    // 推定1RMは出せないのでチップも2つになる
    expect(availableProgressMetrics('reps')).toEqual(['best', 'total']);
  });

  test('重量が1つでも入っていれば重量種目のまま', () => {
    const rows = [row(0, 1, { reps: 10 }), row(1, 1, { weight: 5, reps: 10 })];
    expect(resolveChartMeasurementType('weight_reps', rows)).toBe('weight_reps');
  });

  test('✓未確定の重量は判定に使わない', () => {
    const rows = [row(0, 1, { weight: 20, reps: 10 }, false), row(1, 1, { reps: 10 })];
    expect(resolveChartMeasurementType('weight_reps', rows)).toBe('reps');
  });

  test('もともと重量を持たない計測タイプはそのまま', () => {
    expect(resolveChartMeasurementType('time', [])).toBe('time');
  });
});

describe('目盛りラベルの書式', () => {
  test('整数部を3桁区切りにする', () => {
    expect(formatTickValue(75)).toBe('75');
    expect(formatTickValue(1900)).toBe('1,900');
    expect(formatTickValue(12500)).toBe('12,500');
    expect(formatTickValue(102.5)).toBe('102.5');
    expect(formatTickValue(1234.5)).toBe('1,234.5');
  });

  test('単位は最上段だけ。ただし整数部が4桁以上なら落とす', () => {
    const kg = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'none' } as const;
    expect(formatTickLabel(80, kg, true)).toBe('80 kg');
    expect(formatTickLabel(80, kg, false)).toBe('80');
    expect(formatTickLabel(999, kg, true)).toBe('999 kg');
    expect(formatTickLabel(1900, kg, true)).toBe('1,900');
    expect(formatTickLabel(12000, kg, true)).toBe('12,000');
  });
});

describe('刻みの選び方（総重量・合計回数の値域）', () => {
  const totalKg = { label: 'kg', step: 100, minRange: 200, integerOnly: false, auxKind: 'none' } as const;
  const totalReps = { label: '回', step: 20, minRange: 20, integerOnly: true, auxKind: 'none' } as const;

  const scaleOf = (values: number[], unit: Parameters<typeof computeChartScale>[1]) =>
    computeChartScale(values, unit);

  test('総重量の常用レンジ（1,500〜1,900kg）でグリッドが増えすぎず、下端も0に落ちない', () => {
    const s = scaleOf([1500, 1620, 1740, 1900], totalKg);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    expect(s.ticks[0]).toBeGreaterThan(0);
    // 100の次を500にすると窓が1,500〜2,500まで広がってデータが下半分に潰れる。
    // 250を挟んでいるので刻みはここまでしか上がらない
    expect(s.step).toBeLessThanOrEqual(250);
  });

  test('5桁（8,000〜12,500kg）でもラダーが上がりきり、線が数十本にならない', () => {
    const s = scaleOf([8000, 9500, 11000, 12500], totalKg);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    expect(s.step).toBeGreaterThanOrEqual(1000);
  });

  test('軽い日が混ざって幅が広くても、線が増えすぎず目盛りはきりのいい値のまま', () => {
    // ベンチプレスの総重量の実データ。450kgの日が1つ混ざるだけで、0を避けようとして
    // 刻みが250kgで止まりグリッドが13本引かれていた
    const s = scaleOf([1540, 1382.5, 2000, 1810, 2935, 1752.5, 450, 1990, 1255], totalKg);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    // 半端な目盛り（素の自動スケール）に落とさず、きりのいい値で刻む
    expect(s.ticks.every((t) => Number.isInteger(t) && t % s.step === 0)).toBe(true);
  });

  test('0起点を避けられるデータでは従来どおり下端を0より上に保つ', () => {
    // 30→102.5kg のような「まっとうな重量の伸び」まで0起点にしないこと（デザイン案Y-7）
    const s = scaleOf([30, 45, 60, 72.5, 85, 95, 102.5], {
      label: 'kg',
      step: 5,
      minRange: 10,
      integerOnly: false,
      auxKind: 'reps',
    });
    expect(s.ticks[0]).toBeGreaterThan(0);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
  });

  test('刻みが粗くても、上に1段足したせいでグラフが下へ寄らない', () => {
    // 1,000kg刻みで上に1段（+1,000kg）足すと窓の4割が空き、線が窓の下半分に寄って見える。
    // 5kg刻みなら+5kgで済む話なので、刻みの粗さではなく「窓のうちデータが乗らない割合」で見る
    const v = [1540, 1382.5, 2000, 1810, 2935, 1752.5, 450, 1990, 1255];
    const s = scaleOf(v, totalKg);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    // データが描画範囲の6割以上を占め、最大値より上の空きが2割を超えない
    expect((hi - lo) / (s.max - s.min)).toBeGreaterThan(0.6);
    expect((s.max - hi) / (s.max - s.min)).toBeLessThan(0.2);
  });

  test('スパイクが1つあっても線が窓の下に張り付かない（全期間表示）', () => {
    // 同日2セッションの日が合算されて 4,135kg のスパイクになるデータ。刻みの見積もりが
    // 厳しめなせいで2,500kg刻みが選ばれ、窓が0〜7,500まで広がって線が下2割に張り付いていた
    const v = [450, 1255, 1540, 1810, 2000, 2935, 4135, 1752.5];
    const s = scaleOf(v, totalKg);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    expect((hi - lo) / (s.max - s.min)).toBeGreaterThan(0.6);
  });

  test('合計回数（200〜1,000回）でも整数側のラダーが上がりきる', () => {
    const s = scaleOf([200, 500, 800, 1000], totalReps);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    // 整数の刻みしか選ばない
    expect(Number.isInteger(s.step)).toBe(true);
  });
});

describe('placeBestChip: ハイライトの呼称', () => {
  const unit = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' } as const;
  const points = [
    { dateKey: day(0), startedAt: day(0), value: 70, best: {} as never, sets: [] },
    { dateKey: day(1), startedAt: day(1), value: 75, best: {} as never, sets: [] },
  ];

  test('自己ベストは「ベスト」、他の指標は「最高」。値は前置詞と分けて持つ', () => {
    const layout = computeChartLayout(points, unit, 353, points[1]);

    const best = placeBestChip(layout, unit, 'personal-best')!;
    expect(best.prefix).toBe('ベスト');
    expect(best.value).toBe('75kg');
    expect(best.label).toBe('ベスト 75kg');

    const max = placeBestChip(layout, unit, 'metric-max')!;
    expect(max.prefix).toBe('最高');
    expect(max.value).toBe('75kg');
    // 語が1文字短いぶんチップも狭くなる
    expect(max.width).toBeLessThan(best.width);
  });
});

describe('buildRecordDays: 自重の日も記録一覧に残す', () => {
  test('加重の日と自重の日が混在していても、全部の日が並ぶ', () => {
    const rows = [
      row(0, 1, { weight: 10, reps: 8 }),
      // ベルト無しでやった日。グラフには点を置けないが、やった事実は消さない
      row(1, 1, { weight: 0, reps: 12 }),
      row(2, 1, { weight: 12.5, reps: 8 }),
      row(3, 1, { weight: null, reps: 14 }),
    ];
    // グラフの系列は加重した日だけ
    expect(buildProgressSeries('weight_reps', rows, 'best').points).toHaveLength(2);
    // 一覧は4日とも残る
    const days = buildRecordDays('weight_reps', rows);
    expect(days.map((d) => d.dateKey)).toEqual([day(0), day(1), day(2), day(3)]);
  });

  test('自重の日でも遷移先のセッションを持つ（カードをタップして記録を開ける）', () => {
    const days = buildRecordDays('weight_reps', [row(0, 1, { weight: 0, reps: 12 })]);
    expect(days[0].best.sessionId).toBe(1);
    expect(days[0].sets).toHaveLength(1);
  });

  test('✓確定セットが1つも無い日は並べない', () => {
    const days = buildRecordDays('weight_reps', [
      row(0, 1, { weight: 60, reps: 8 }, false),
      row(1, 1, { weight: 60, reps: 8 }),
    ]);
    expect(days.map((d) => d.dateKey)).toEqual([day(1)]);
  });

  test('同じ日の複数セッションは1日にまとまる（グラフと同じ数え方）', () => {
    const days = buildRecordDays('weight_reps', [
      row(0, 1, { weight: 60, reps: 8 }),
      { ...row(0, 1, { weight: 65, reps: 6 }), sessionId: 99, workoutSessionExerciseId: 99 },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].sets).toHaveLength(2);
  });
});
