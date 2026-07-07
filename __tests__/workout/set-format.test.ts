import {
  combineDurationDisplay,
  formatDistanceKmDisplay,
  formatDurationDisplay,
  formatHistorySetSummary,
  MEASUREMENT_COLUMNS,
  parseColumns,
  parseColumnsWithFallback,
  parseDistanceKmInput,
  parseDurationInput,
  parseIntInput,
  parseNumberInput,
  splitDurationDisplay,
  toDisplayValues,
} from '@/lib/workout/set-format';

describe('parseDurationInput', () => {
  it('mm:ss形式を秒数に変換する', () => {
    expect(parseDurationInput('1:30')).toBe(90);
    expect(parseDurationInput('0:45')).toBe(45);
  });

  it('コロン無しの数値はそのまま秒として扱う', () => {
    expect(parseDurationInput('90')).toBe(90);
  });

  it('空文字はnullを返す', () => {
    expect(parseDurationInput('')).toBeNull();
    expect(parseDurationInput('   ')).toBeNull();
  });

  it('数値として解釈できない文字列はnullを返す', () => {
    expect(parseDurationInput('abc')).toBeNull();
  });

  it('負の値はnullを返す（"-2:-30"のような破綻した表示を防ぐ）', () => {
    expect(parseDurationInput('-90')).toBeNull();
    expect(parseDurationInput('-1:30')).toBeNull();
  });

  it('秒が60以上のmm:ssはnullを返す', () => {
    expect(parseDurationInput('1:75')).toBeNull();
    expect(parseDurationInput('2:99')).toBeNull();
  });

  it('中途半端なmm:ss形式はnullを返す', () => {
    expect(parseDurationInput('1:')).toBeNull();
    expect(parseDurationInput(':30')).toBeNull();
    expect(parseDurationInput('1:2:3')).toBeNull();
  });

  it('小数の秒は丸める', () => {
    expect(parseDurationInput('90.5')).toBe(91);
  });
});

describe('formatDurationDisplay', () => {
  it('秒数をmm:ss表示にする', () => {
    expect(formatDurationDisplay(90)).toBe('1:30');
    expect(formatDurationDisplay(45)).toBe('0:45');
    expect(formatDurationDisplay(0)).toBe('0:00');
  });

  it('nullやundefinedは空文字を返す', () => {
    expect(formatDurationDisplay(null)).toBe('');
    expect(formatDurationDisplay(undefined)).toBe('');
  });
});

describe('splitDurationDisplay / combineDurationDisplay（時間入力の分・秒分割）', () => {
  it('"mm:ss"形式を分・秒に分解する', () => {
    expect(splitDurationDisplay('1:30')).toEqual({ min: '1', sec: '30' });
    expect(splitDurationDisplay('0:45')).toEqual({ min: '0', sec: '45' });
  });

  it('空文字は分・秒とも空文字になる', () => {
    expect(splitDurationDisplay('')).toEqual({ min: '', sec: '' });
  });

  it('コロンが無い等の不正な形式も分・秒とも空文字になる', () => {
    expect(splitDurationDisplay('abc')).toEqual({ min: '', sec: '' });
  });

  it('分・秒どちらかが空欄でも0として結合する', () => {
    expect(combineDurationDisplay('', '45')).toBe('0:45');
    expect(combineDurationDisplay('5', '')).toBe('5:0');
  });

  it('分・秒とも空欄なら空文字のまま（未入力扱い）', () => {
    expect(combineDurationDisplay('', '')).toBe('');
  });

  it('分・秒を結合した文字列はparseDurationInputで正しくパースできる（ラウンドトリップ）', () => {
    const combined = combineDurationDisplay('5', '');
    expect(parseDurationInput(combined)).toBe(300);
  });
});

describe('distance km<->meters conversion', () => {
  it('km入力をmに変換する', () => {
    expect(parseDistanceKmInput('5')).toBe(5000);
    expect(parseDistanceKmInput('2.5')).toBe(2500);
  });

  it('mをkm表示に変換する（整数kmは小数第1位まで表示する）', () => {
    expect(formatDistanceKmDisplay(5000)).toBe('5.0');
    expect(formatDistanceKmDisplay(2500)).toBe('2.5');
    expect(formatDistanceKmDisplay(2550)).toBe('2.55');
  });

  it('nullは空文字/nullを返す', () => {
    expect(formatDistanceKmDisplay(null)).toBe('');
    expect(parseDistanceKmInput('')).toBeNull();
  });

  it('負の距離はnullを返す', () => {
    expect(parseDistanceKmInput('-5')).toBeNull();
  });
});

describe('parseNumberInput / parseIntInput', () => {
  it('数値以外はnullを返す', () => {
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseIntInput('abc')).toBeNull();
  });

  it('負の値はnullを返す', () => {
    expect(parseNumberInput('-60')).toBeNull();
    expect(parseIntInput('-10')).toBeNull();
  });

  it('末尾に不正な文字が付く入力（"12abc"等）はnullを返す', () => {
    expect(parseNumberInput('12abc')).toBeNull();
    expect(parseIntInput('12abc')).toBeNull();
  });

  it('parseIntInputは整数のみ許可し、小数はnullを返す', () => {
    expect(parseIntInput('10.9')).toBeNull();
    expect(parseIntInput('10')).toBe(10);
  });

  it('parseNumberInputは小数を許可する', () => {
    expect(parseNumberInput('60.5')).toBe(60.5);
  });
});

describe('MEASUREMENT_COLUMNS', () => {
  it('weight_repsは重量・回数の2列', () => {
    expect(MEASUREMENT_COLUMNS.weight_reps.map((c) => c.key)).toEqual(['weight', 'reps']);
  });

  it('repsは回数のみ1列', () => {
    expect(MEASUREMENT_COLUMNS.reps.map((c) => c.key)).toEqual(['reps']);
  });

  it('timeは時間のみ1列', () => {
    expect(MEASUREMENT_COLUMNS.time.map((c) => c.key)).toEqual(['durationSeconds']);
  });

  it('distance_timeは距離・時間の2列', () => {
    expect(MEASUREMENT_COLUMNS.distance_time.map((c) => c.key)).toEqual([
      'distanceMeters',
      'durationSeconds',
    ]);
  });

  it('weight_timeは重量・時間の2列', () => {
    expect(MEASUREMENT_COLUMNS.weight_time.map((c) => c.key)).toEqual([
      'weight',
      'durationSeconds',
    ]);
  });
});

describe('toDisplayValues', () => {
  it('DB値を列定義に沿って表示用文字列に変換する', () => {
    const result = toDisplayValues(MEASUREMENT_COLUMNS.weight_reps, { weight: 62.5, reps: 8 });
    expect(result).toEqual({ weight: '62.5', reps: '8' });
  });

  it('nullは空文字になる', () => {
    const result = toDisplayValues(MEASUREMENT_COLUMNS.weight_reps, { weight: null, reps: null });
    expect(result).toEqual({ weight: '', reps: '' });
  });

  it('未使用の列（この計測タイプに無いキー）は無視される', () => {
    const result = toDisplayValues(MEASUREMENT_COLUMNS.reps, {
      weight: 60,
      reps: 10,
    } as any);
    expect(result).toEqual({ reps: '10' });
  });
});

describe('parseColumns', () => {
  it('表示用文字列を列定義に沿ってDB保存用の値にパースする', () => {
    const result = parseColumns(MEASUREMENT_COLUMNS.weight_reps, { weight: '62.5', reps: '8' });
    expect(result).toEqual({ weight: 62.5, reps: 8 });
  });

  it('空欄はnullになる', () => {
    const result = parseColumns(MEASUREMENT_COLUMNS.weight_reps, { weight: '', reps: '' });
    expect(result).toEqual({ weight: null, reps: null });
  });

  it('不正な入力（パース不可）はnullになる（呼び出し側での不正検知が必要な場合は各列のfromDisplayを直接使う）', () => {
    const result = parseColumns(MEASUREMENT_COLUMNS.weight_reps, { weight: '60kg', reps: '10' });
    expect(result).toEqual({ weight: null, reps: 10 });
  });

  it('一部の列だけ値がある場合、残りはnullになる', () => {
    const result = parseColumns(MEASUREMENT_COLUMNS.distance_time, {
      distanceMeters: '5',
      durationSeconds: '',
    });
    expect(result).toEqual({ distanceMeters: 5000, durationSeconds: null });
  });
});

describe('parseColumnsWithFallback', () => {
  it('正常にパースできる場合はparseColumnsと同じ', () => {
    const result = parseColumnsWithFallback(
      MEASUREMENT_COLUMNS.weight_reps,
      { weight: '62.5', reps: '8' },
      {},
    );
    expect(result).toEqual({ weight: 62.5, reps: 8 });
  });

  it('空欄はfallbackを使わずnullになる', () => {
    const result = parseColumnsWithFallback(
      MEASUREMENT_COLUMNS.weight_reps,
      { weight: '', reps: '' },
      { weight: 999, reps: 999 },
    );
    expect(result).toEqual({ weight: null, reps: null });
  });

  it('不正な入力（パース不可）はfallbackの値を使う（タイプミスで値を失わないため）', () => {
    const result = parseColumnsWithFallback(
      MEASUREMENT_COLUMNS.weight_reps,
      { weight: '60kg', reps: '10' },
      { weight: 80, reps: 6 },
    );
    expect(result).toEqual({ weight: 80, reps: 10 });
  });

  it('不正な入力でfallback自体もnullの場合はnullになる', () => {
    const result = parseColumnsWithFallback(
      MEASUREMENT_COLUMNS.weight_reps,
      { weight: '60kg', reps: '10' },
      { weight: null, reps: null },
    );
    expect(result).toEqual({ weight: null, reps: 10 });
  });
});

describe('formatHistorySetSummary', () => {
  it('weight_reps(2列)は"60kg×10"のように×区切りにする', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, [
      { weight: 60, reps: 10 },
    ]);
    expect(result).toBe('60kg×10');
  });

  it('複数セットは"・"区切りで連結する', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 8 },
    ]);
    expect(result).toBe('60kg×10・60kg×8');
  });

  it('reps(1列)は×区切りが発生しない', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.reps, [{ reps: 20 }, { reps: 18 }]);
    expect(result).toBe('20回・18回');
  });

  it('1分未満のtimeは素の秒数("45秒")にする', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.time, [{ durationSeconds: 45 }]);
    expect(result).toBe('45秒');
  });

  it('1分以上のtimeはmm:ss("1:30")にする（他画面のformatDurationDisplayと表記を揃える）', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.time, [{ durationSeconds: 90 }]);
    expect(result).toBe('1:30');
  });

  it('distance_timeはkm表示×時間表示になる', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.distance_time, [
      { distanceMeters: 5000, durationSeconds: 1500 },
    ]);
    expect(result).toBe('5.0km×25:00');
  });

  it('weight_timeは重量×時間になる', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_time, [
      { weight: 20, durationSeconds: 45 },
    ]);
    expect(result).toBe('20kg×45秒');
  });

  it('一部の列がnull（未入力）の場合、その列だけ省いて連結する（"×"が空欄を挟まない）', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, [
      { weight: 60, reps: null },
    ]);
    expect(result).toBe('60kg');
  });

  it('全列nullのセットは空文字になる', () => {
    const result = formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, [
      { weight: null, reps: null },
    ]);
    expect(result).toBe('');
  });

  it('setsListが空配列なら空文字', () => {
    expect(formatHistorySetSummary(MEASUREMENT_COLUMNS.weight_reps, [])).toBe('');
  });
});
