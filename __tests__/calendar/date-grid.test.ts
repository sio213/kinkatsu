import { addMonths, buildMonthGridDates, CELLS_PER_WEEK, isSameDay, WEEKS_PER_GRID } from '@/lib/calendar/date-grid';

describe('isSameDay', () => {
  it('同じ年月日なら true', () => {
    expect(isSameDay(new Date(2026, 6, 16, 9, 0), new Date(2026, 6, 16, 23, 59))).toBe(true);
  });

  it('日付だけ違えば false', () => {
    expect(isSameDay(new Date(2026, 6, 16), new Date(2026, 6, 17))).toBe(false);
  });

  it('月だけ違えば false（同じ日番号でも別月は別日）', () => {
    expect(isSameDay(new Date(2026, 6, 16), new Date(2026, 7, 16))).toBe(false);
  });

  it('年だけ違えば false', () => {
    expect(isSameDay(new Date(2026, 6, 16), new Date(2027, 6, 16))).toBe(false);
  });
});

describe('buildMonthGridDates', () => {
  it('常に42日分（6週間×7日）を返す', () => {
    expect(buildMonthGridDates(2026, 6)).toHaveLength(WEEKS_PER_GRID * CELLS_PER_WEEK);
  });

  it('先頭は日曜日、末尾は土曜日で終わる（週の境界を跨がない）', () => {
    const dates = buildMonthGridDates(2026, 6);
    expect(dates[0].getDay()).toBe(0);
    expect(dates[dates.length - 1].getDay()).toBe(6);
  });

  it('連続した日付になっている（欠け・重複がない）', () => {
    const dates = buildMonthGridDates(2026, 6);
    for (let i = 1; i < dates.length; i++) {
      // DST地域では1日の実経過時間が23h/25hになりうるため厳密な86_400_000一致ではなく
      // Math.roundで1日単位に丸めて判定する（日本は非DSTだが、実装はどのTZでも
      // ローカルカレンダー演算のみで安全なため、この丸めはテスト側の安全マージン）
      const diffDays = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000);
      expect(diffDays).toBe(1);
    }
  });

  it('2026年7月1日(水)を含み、前月(6月)の日付から始まる', () => {
    const dates = buildMonthGridDates(2026, 6);
    const firstOfMonth = dates.find((d) => d.getMonth() === 6 && d.getDate() === 1);
    expect(firstOfMonth).toBeDefined();
    expect(dates[0].getMonth()).toBe(5);
  });

  it('1日が日曜始まりの月は前月の日付を含まない', () => {
    // 2026年3月1日は日曜日
    const dates = buildMonthGridDates(2026, 2);
    expect(dates[0].getMonth()).toBe(2);
    expect(dates[0].getDate()).toBe(1);
  });

  it('年をまたぐ月（12月）でも正しく生成できる', () => {
    const dates = buildMonthGridDates(2026, 11);
    const dec1 = dates.find((d) => d.getMonth() === 11 && d.getDate() === 1);
    expect(dec1).toBeDefined();
  });

  it('うるう年2月でも42日を維持する', () => {
    // 2028年はうるう年
    expect(buildMonthGridDates(2028, 1)).toHaveLength(WEEKS_PER_GRID * CELLS_PER_WEEK);
  });

  it('1日が土曜始まりの月は前月から最大6日分を含む（境界値）', () => {
    // 2026年8月1日は土曜日
    const dates = buildMonthGridDates(2026, 7);
    expect(dates[0].getMonth()).toBe(6);
    expect(dates[0].getDate()).toBe(26);
    expect(dates[6].getMonth()).toBe(7);
    expect(dates[6].getDate()).toBe(1);
  });

  it.each([
    [2026, 0, 31], // 1月
    [2026, 1, 28], // 2月（平年）
    [2028, 1, 29], // 2月（うるう年）
    [2026, 3, 30], // 4月
  ])('%s年%s月(0始まり)は当月日数(%s日)ぶんだけ当月扱いの日付を含み、欠番がない', (year, month, expectedDays) => {
    const dates = buildMonthGridDates(year, month);
    const currentMonthDates = dates.filter((d) => d.getFullYear() === year && d.getMonth() === month);
    expect(currentMonthDates).toHaveLength(expectedDays);
    expect(currentMonthDates.map((d) => d.getDate())).toEqual(
      Array.from({ length: expectedDays }, (_, i) => i + 1),
    );
  });

  it('平年2月は2/29を含まない（2/28の翌日は3/1になる）', () => {
    const dates = buildMonthGridDates(2026, 1);
    const feb29 = dates.find((d) => d.getMonth() === 1 && d.getDate() === 29);
    expect(feb29).toBeUndefined();
  });

  it('month=12（範囲外）はDateコンストラクタの正規化により翌年1月として扱われる（暗黙契約の固定）', () => {
    const dates = buildMonthGridDates(2026, 12);
    const jan1 = dates.find((d) => d.getFullYear() === 2027 && d.getMonth() === 0 && d.getDate() === 1);
    expect(jan1).toBeDefined();
  });
});

describe('addMonths', () => {
  it('同じ年内の翌月・前月を計算できる', () => {
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
    expect(addMonths(2026, 6, -1)).toEqual({ year: 2026, month: 5 });
  });

  it('年をまたぐ翌月（12月→翌年1月）を計算できる', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('年をまたぐ前月（1月→前年12月）を計算できる', () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('delta=0はそのままの年月を返す', () => {
    expect(addMonths(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
  });

  it('大きなdelta（10年分・120ヶ月）でも年月を正しく計算できる', () => {
    expect(addMonths(2026, 6, 120)).toEqual({ year: 2036, month: 6 });
    expect(addMonths(2026, 6, -120)).toEqual({ year: 2016, month: 6 });
  });

  it('任意のdeltaで往復すると元の年月に戻る（プロパティテスト）', () => {
    for (let delta = -36; delta <= 36; delta++) {
      const forward = addMonths(2026, 6, delta);
      const back = addMonths(forward.year, forward.month, -delta);
      expect(back).toEqual({ year: 2026, month: 6 });
    }
  });

  it('戻り値のmonthは常に0-11に収まる', () => {
    for (let delta = -50; delta <= 50; delta++) {
      const { month } = addMonths(2026, 6, delta);
      expect(month).toBeGreaterThanOrEqual(0);
      expect(month).toBeLessThanOrEqual(11);
    }
  });
});
