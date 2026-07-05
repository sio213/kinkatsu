import {
  formatDistanceKmDisplay,
  formatDurationDisplay,
  MEASUREMENT_COLUMNS,
  parseDistanceKmInput,
  parseDurationInput,
  parseIntInput,
  parseNumberInput,
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
});

describe('parseNumberInput / parseIntInput', () => {
  it('数値以外はnullを返す', () => {
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseIntInput('abc')).toBeNull();
  });

  it('parseIntInputは小数点以下を切り捨てる', () => {
    expect(parseIntInput('10.9')).toBe(10);
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
