import {
  buildProgressSeries,
  DEFAULT_PROGRESS_PERIOD,
  filterProgressPoints,
  findPersonalBest,
  formatProgressAux,
  progressPeriodStart,
  toDayKey,
  type ProgressPoint,
  type ProgressSetRow,
  type ProgressUnit,
} from '@/lib/exercises/progress';

// 日付をローカル時刻のepoch msにする（テスト内の期待値もローカル基準で書く）
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

type RowOverrides = Partial<ProgressSetRow> & { startedAt: number; setNumber: number };

function row(overrides: RowOverrides): ProgressSetRow {
  return {
    sessionId: 1,
    workoutSessionExerciseId: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    // 既定は✓確定済み。未確定のセットを混ぜたいテストだけ completedAt: null を渡す
    completedAt: overrides.startedAt,
    ...overrides,
  };
}

describe('buildProgressSeries: 重量種目', () => {
  test('1日1点にまとめ、その日の最大重量を値にする', () => {
    const day = at(2026, 7, 23);
    const { unit, points } = buildProgressSeries('weight_reps', [
      row({ startedAt: day, setNumber: 1, weight: 70, reps: 8 }),
      row({ startedAt: day, setNumber: 2, weight: 75, reps: 7 }),
      row({ startedAt: day, setNumber: 3, weight: 70, reps: 8 }),
    ]);

    expect(unit.label).toBe('kg');
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(75);
    expect(points[0].dateKey).toBe(toDayKey(day));
    expect(points[0].startedAt).toBe(day);
    expect(points[0].sets).toHaveLength(3);
    expect(points[0].best.setNumber).toBe(2);
  });

  test('同じ重量が複数セットあるときは回数が多いセットをBest Setにする', () => {
    const day = at(2026, 7, 23);
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: day, setNumber: 1, weight: 70, reps: 6 }),
      row({ startedAt: day, setNumber: 2, weight: 70, reps: 9 }),
    ]);

    expect(points[0].best.setNumber).toBe(2);
    expect(points[0].value).toBe(70);
  });

  test('重量も回数も同値なら先にやったセットをBest Setにする（自己ベストの判定と同じ考え方）', () => {
    const day = at(2026, 7, 23);
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: day, setNumber: 1, weight: 70, reps: 8 }),
      row({ startedAt: day, setNumber: 2, weight: 70, reps: 8 }),
    ]);

    expect(points[0].best.setNumber).toBe(1);
  });

  test('同じ日に複数カード（ウォームアップ用＋本番用）があっても1点にまとまる', () => {
    const morning = at(2026, 7, 23, 9);
    const evening = at(2026, 7, 23, 20);
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: morning, workoutSessionExerciseId: 1, sessionId: 1, setNumber: 1, weight: 40, reps: 15 }),
      row({ startedAt: evening, workoutSessionExerciseId: 2, sessionId: 2, setNumber: 1, weight: 80, reps: 5 }),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(80);
    expect(points[0].sets).toHaveLength(2);
    // 見出しの日付には、その日の最初のセッションの開始時刻を使う
    expect(points[0].startedAt).toBe(morning);
    // 「>」の遷移先はBest Setがあるセッション
    expect(points[0].best.sessionId).toBe(2);
  });

  test('古い順に並ぶ', () => {
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: at(2026, 5, 1), setNumber: 1, weight: 60, reps: 8 }),
      row({ startedAt: at(2026, 6, 1), setNumber: 1, weight: 65, reps: 8 }),
      row({ startedAt: at(2026, 7, 1), setNumber: 1, weight: 70, reps: 8 }),
    ]);

    expect(points.map((p) => p.value)).toEqual([60, 65, 70]);
  });

  test('主指標が全セットnullの日は点を作らない（値の無いセットだけ✓した場合）', () => {
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: at(2026, 7, 1), setNumber: 1, weight: null, reps: 8 }),
      row({ startedAt: at(2026, 7, 8), setNumber: 1, weight: 60, reps: 8 }),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(60);
  });

  test('記録が無ければ空の系列を返す', () => {
    expect(buildProgressSeries('weight_reps', []).points).toEqual([]);
  });
});

describe('buildProgressSeries: 単位', () => {
  test('回数種目は「回」で刻み5・最小レンジ5', () => {
    const { unit, points } = buildProgressSeries('reps', [
      row({ startedAt: at(2026, 7, 23), setNumber: 1, reps: 16 }),
    ]);

    expect(unit).toMatchObject({ label: '回', step: 5, minRange: 5, auxKind: 'sets' });
    expect(points[0].value).toBe(16);
  });

  test('加重ホールド系（weight_time）は重量が主指標で、補助情報は時間', () => {
    const day = at(2026, 7, 23);
    const { unit, points } = buildProgressSeries('weight_time', [
      row({ startedAt: day, setNumber: 1, weight: 20, durationSeconds: 60 }),
      row({ startedAt: day, setNumber: 2, weight: 20, durationSeconds: 75 }),
    ]);

    expect(unit).toMatchObject({ label: 'kg', auxKind: 'duration' });
    expect(points[0].value).toBe(20);
    // 同じ重量なら長く保った方が代表
    expect(points[0].best.setNumber).toBe(2);
  });

  test('距離種目はmをkmに換算する', () => {
    const { unit, points } = buildProgressSeries('distance_time', [
      row({ startedAt: at(2026, 7, 23), setNumber: 1, distanceMeters: 3500, durationSeconds: 1200 }),
    ]);

    expect(unit).toMatchObject({ label: 'km', step: 2.5, auxKind: 'none' });
    expect(points[0].value).toBe(3.5);
  });

  test('時間種目は10分未満なら「秒」のまま描く', () => {
    const { unit, points } = buildProgressSeries('time', [
      row({ startedAt: at(2026, 7, 23), setNumber: 1, durationSeconds: 70 }),
    ]);

    expect(unit).toMatchObject({ label: '秒', step: 10 });
    expect(points[0].value).toBe(70);
  });

  test('時間種目は10分以上の記録が1つでもあれば「分」に切り替え、全点を分に換算する', () => {
    const { unit, points } = buildProgressSeries('time', [
      row({ startedAt: at(2026, 7, 1), setNumber: 1, durationSeconds: 1200 }),
      row({ startedAt: at(2026, 7, 8), setNumber: 1, durationSeconds: 1500 }),
    ]);

    expect(unit).toMatchObject({ label: '分', step: 10 });
    expect(points.map((p) => p.value)).toEqual([20, 25]);
  });

  test('分への換算で小数の誤差が残らない', () => {
    const { points } = buildProgressSeries('time', [
      row({ startedAt: at(2026, 7, 1), setNumber: 1, durationSeconds: 610 }),
    ]);

    // 610 / 60 = 10.1666... を小数第2位で丸める
    expect(points[0].value).toBe(10.17);
  });
});

describe('期間の絞り込み', () => {
  const now = at(2026, 7, 28);
  const series = buildProgressSeries('weight_reps', [
    row({ startedAt: at(2025, 12, 1), setNumber: 1, weight: 50, reps: 8 }),
    row({ startedAt: at(2026, 2, 1), setNumber: 1, weight: 55, reps: 8 }),
    row({ startedAt: at(2026, 5, 1), setNumber: 1, weight: 60, reps: 8 }),
    row({ startedAt: at(2026, 7, 1), setNumber: 1, weight: 65, reps: 8 }),
    row({ startedAt: at(2026, 7, 23), setNumber: 1, weight: 70, reps: 8 }),
  ]);

  test('既定は3ヶ月', () => {
    expect(DEFAULT_PROGRESS_PERIOD).toBe('3m');
  });

  test('1ヶ月は直近1ヶ月ぶんだけ残る', () => {
    expect(filterProgressPoints(series.points, '1m', now).map((p) => p.value)).toEqual([65, 70]);
  });

  test('3ヶ月・6ヶ月とさかのぼるほど点が増える', () => {
    expect(filterProgressPoints(series.points, '3m', now).map((p) => p.value)).toEqual([60, 65, 70]);
    expect(filterProgressPoints(series.points, '6m', now).map((p) => p.value)).toEqual([55, 60, 65, 70]);
  });

  test('全期間は絞り込まない', () => {
    expect(filterProgressPoints(series.points, 'all', now)).toHaveLength(5);
  });

  test('起点はカレンダー上のNヶ月前の同日（日単位に丸める）', () => {
    expect(progressPeriodStart('3m', now)).toBe(toDayKey(at(2026, 4, 28)));
    expect(progressPeriodStart('all', now)).toBeNull();
  });

  test('起点ちょうどの日は含む', () => {
    const boundary = buildProgressSeries('weight_reps', [
      row({ startedAt: at(2026, 4, 28, 23), setNumber: 1, weight: 60, reps: 8 }),
    ]);
    expect(filterProgressPoints(boundary.points, '3m', now)).toHaveLength(1);
  });
});

describe('formatProgressAux: ツールチップの補助情報', () => {
  const emptySet = {
    sessionId: 1,
    workoutSessionExerciseId: 1,
    setNumber: 1,
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: 1,
  };
  const point = (best: Partial<ProgressSetRow>, setCount = 3): ProgressPoint => ({
    dateKey: 0,
    startedAt: 0,
    value: 0,
    best: { ...emptySet, ...best },
    sets: new Array(setCount).fill(emptySet),
  });

  const unit = (auxKind: ProgressUnit['auxKind']): ProgressUnit => ({
    label: 'kg',
    step: 5,
    minRange: 10,
    integerOnly: false,
    auxKind,
  });

  test('重量種目はBest Setの回数', () => {
    expect(formatProgressAux(unit('reps'), point({ reps: 7 }))).toBe('×7');
  });

  test('加重ホールド系はBest Setの時間（1分以上は分:秒）', () => {
    expect(formatProgressAux(unit('duration'), point({ durationSeconds: 45 }))).toBe('×45秒');
    expect(formatProgressAux(unit('duration'), point({ durationSeconds: 90 }))).toBe('×1:30');
  });

  test('回数・時間種目はその日のセット数', () => {
    expect(formatProgressAux(unit('sets'), point({}, 3))).toBe('×3セット');
  });

  test('距離・長時間の有酸素は補助情報を出さない', () => {
    expect(formatProgressAux(unit('none'), point({ reps: 7 }))).toBeNull();
  });

  test('値が無ければ出さない（「×」だけが残らないように）', () => {
    expect(formatProgressAux(unit('reps'), point({ reps: null }))).toBeNull();
    expect(formatProgressAux(unit('duration'), point({ durationSeconds: null }))).toBeNull();
  });
});

describe('進行中セッションの✓未確定セット', () => {
  test('✓未確定のセットは点の値・Best Setに使わない（後で外されると「減った」ように見えるため）', () => {
    const day = at(2026, 7, 26);
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: day, setNumber: 1, weight: 72.5, reps: 8 }),
      row({ startedAt: day, setNumber: 2, weight: 77.5, reps: 6 }),
      // まだ✓を押していないセット。値は入っているが実施済みではない
      row({ startedAt: day, setNumber: 3, weight: 100, reps: 5, completedAt: null }),
    ]);

    expect(points[0].value).toBe(77.5);
    expect(points[0].best.setNumber).toBe(2);
  });

  test('✓未確定のセットも内訳カード用にsetsへは残す', () => {
    const day = at(2026, 7, 26);
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: day, setNumber: 1, weight: 72.5, reps: 8 }),
      row({ startedAt: day, setNumber: 2, weight: null, reps: null, completedAt: null }),
    ]);

    expect(points[0].sets).toHaveLength(2);
    expect(points[0].sets[1].completedAt).toBeNull();
  });

  test('✓が1件も無い日は点にしない', () => {
    const { points } = buildProgressSeries('weight_reps', [
      row({ startedAt: at(2026, 7, 26), setNumber: 1, weight: 70, reps: 8, completedAt: null }),
    ]);
    expect(points).toEqual([]);
  });
});

describe('findPersonalBest', () => {
  const points = (values: number[]) =>
    buildProgressSeries(
      'weight_reps',
      values.map((weight, i) => row({ startedAt: at(2026, 5, i + 1), setNumber: 1, weight, reps: 8 })),
    ).points;

  test('最大値の点を選ぶ', () => {
    const p = points([60, 75, 70]);
    expect(findPersonalBest(p)).toBe(p[1]);
  });

  test('同じ値が複数回あるときは最初に到達した回に付ける（後からタイしただけの日は選ばない）', () => {
    const p = points([60, 75, 70, 75]);
    expect(findPersonalBest(p)).toBe(p[1]);
  });

  test('点が無ければnull', () => {
    expect(findPersonalBest([])).toBeNull();
  });
});
