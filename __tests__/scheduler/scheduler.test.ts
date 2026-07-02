// DB・通知APIはここでは不要なのでモック
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({ reminders: {}, reminderNotifications: {} }));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  eq: jest.fn(),
  gt: jest.fn(),
  lte: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
}));
jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import {
  computeBiweeklyFireDates,
  computeIntervalFireDates,
  computeMonthIntervalFireDates,
  computeMonthlyQueueFireDates,
  computeYearlyFireDates,
  getNextFireDate,
  nextDailyFireDate,
  nextWeeklyFireDate,
  normalizeInput,
  resolveMonthDay,
} from '@/lib/notifications/scheduler';
import { MONTH_END } from '@/lib/notifications/types';

// テスト基準日: 2026-01-05 (月曜) 10:00
const FROM = new Date('2026-01-05T10:00:00');
const H = 7;   // 通知時刻: 07:00
const M = 0;

function d(iso: string) {
  return new Date(iso);
}

// ─────────────────────────────────────────────
// resolveMonthDay
// ─────────────────────────────────────────────
describe('resolveMonthDay', () => {
  test('通常の日は変換しない', () => {
    expect(resolveMonthDay(2026, 0, 15)).toBe(15); // Jan 15
  });
  test('月末(99)は最終日を返す', () => {
    expect(resolveMonthDay(2026, 0, 99)).toBe(31); // Jan 31
    expect(resolveMonthDay(2026, 1, 99)).toBe(28); // Feb 28 (平年)
    expect(resolveMonthDay(2024, 1, 99)).toBe(29); // Feb 29 (閏年)
  });
  test('その月に存在しない日は最終日に繰り上げ', () => {
    expect(resolveMonthDay(2026, 1, 31)).toBe(28); // Feb 31 → Feb 28
    expect(resolveMonthDay(2026, 1, 30)).toBe(28); // Feb 30 → Feb 28
    expect(resolveMonthDay(2026, 1, 29)).toBe(28); // Feb 29 → Feb 28
    expect(resolveMonthDay(2026, 3, 31)).toBe(30); // Apr 31 → Apr 30
  });
});

// ─────────────────────────────────────────────
// normalizeInput
// ─────────────────────────────────────────────
describe('normalizeInput', () => {
  test('7曜日全選択でも kind は変わらない', () => {
    const result = normalizeInput({
      title: 'test',
      body: 'test',
      kind: 'weekly',
      hour: 7,
      minute: 0,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
    });
    expect(result.kind).toBe('weekly');
    expect(result.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('月末(99)選択時に 29/30 を除外（2月三重発火防止）', () => {
    const result = normalizeInput({
      title: 'test',
      body: 'test',
      kind: 'monthly',
      hour: 7,
      minute: 0,
      monthdays: [1, 15, 29, 30, 99],
      enabled: true,
    });
    expect(result.monthdays).toEqual([1, 15, 99]);
  });

  test('月末(99)選択時に 31 も除外', () => {
    const result = normalizeInput({
      title: 'test',
      body: 'test',
      kind: 'monthly',
      hour: 7,
      minute: 0,
      monthdays: [1, 31, 99],
      enabled: true,
    });
    expect(result.monthdays).toEqual([1, 99]);
  });

  test('月末なしなら 29/30/31 はそのまま', () => {
    const result = normalizeInput({
      title: 'test',
      body: 'test',
      kind: 'monthly',
      hour: 7,
      minute: 0,
      monthdays: [28, 29, 30, 31],
      enabled: true,
    });
    expect(result.monthdays).toEqual([28, 29, 30, 31]);
  });
});

// ─────────────────────────────────────────────
// 毎日リマインド
// ─────────────────────────────────────────────
describe('毎日リマインド', () => {
  test('当日の通知時刻が過ぎていれば翌日を返す', () => {
    // FROM = 月 10:00、通知 07:00 → 当日分は過ぎているので翌日
    const next = nextDailyFireDate(FROM, H, M);
    expect(next).toEqual(d('2026-01-06T07:00:00'));
  });

  test('通知時刻前なら当日を返す', () => {
    const from = d('2026-01-05T06:00:00'); // 07:00 前
    const next = nextDailyFireDate(from, H, M);
    expect(next).toEqual(d('2026-01-05T07:00:00'));
  });

  // 「1日に2回」はリマインダー2件で実現（単一kindでは非対応）
  test('1日に2回: 朝7時と夜21時を別リマインダーで設定する', () => {
    const morning = nextDailyFireDate(FROM, 7, 0);
    const evening = nextDailyFireDate(FROM, 21, 0);
    // 朝7時は過ぎているので翌日
    expect(morning).toEqual(d('2026-01-06T07:00:00'));
    // 夜21時はまだ来ていないので当日
    expect(evening).toEqual(d('2026-01-05T21:00:00'));
  });
});

// ─────────────────────────────────────────────
// 2日ごとにリマインド (interval)
// ─────────────────────────────────────────────
describe('2日ごとにリマインド', () => {
  const anchorDate = d('2026-01-05T07:00:00').getTime(); // 当日07:00を起点

  test('次回は2日後', () => {
    const dates = computeIntervalFireDates(FROM, anchorDate, 2, H, M, 3);
    expect(dates[0]).toEqual(d('2026-01-07T07:00:00')); // Jan 7
    expect(dates[1]).toEqual(d('2026-01-09T07:00:00')); // Jan 9
    expect(dates[2]).toEqual(d('2026-01-11T07:00:00')); // Jan 11
  });

  test('3日ごとも同様に機能する', () => {
    const dates = computeIntervalFireDates(FROM, anchorDate, 3, H, M, 2);
    expect(dates[0]).toEqual(d('2026-01-08T07:00:00')); // Jan 8
    expect(dates[1]).toEqual(d('2026-01-11T07:00:00')); // Jan 11
  });
});

// ─────────────────────────────────────────────
// 毎週火曜にリマインド (weekly)
// ─────────────────────────────────────────────
describe('毎週火曜にリマインド', () => {
  const weekdays = [2]; // 2 = 火曜

  test('月曜10時から → 翌日（火曜）07:00', () => {
    const next = nextWeeklyFireDate(FROM, weekdays, H, M);
    expect(next).toEqual(d('2026-01-06T07:00:00')); // Jan 6 Tue
  });

  test('火曜10時（通知時刻後） → 来週火曜', () => {
    const fromTue = d('2026-01-06T10:00:00');
    const next = nextWeeklyFireDate(fromTue, weekdays, H, M);
    expect(next).toEqual(d('2026-01-13T07:00:00')); // Jan 13 Tue
  });

  test('火曜06時（通知時刻前） → 当日', () => {
    const fromTue = d('2026-01-06T06:00:00');
    const next = nextWeeklyFireDate(fromTue, weekdays, H, M);
    expect(next).toEqual(d('2026-01-06T07:00:00')); // Jan 6 Tue
  });
});

// ─────────────────────────────────────────────
// 毎週月・水・金にリマインド (weekly)
// ─────────────────────────────────────────────
describe('毎週月・水・金にリマインド', () => {
  const weekdays = [1, 3, 5]; // 月・水・金

  test('月曜10時（月曜07:00は過ぎ） → 水曜07:00', () => {
    const next = nextWeeklyFireDate(FROM, weekdays, H, M);
    expect(next).toEqual(d('2026-01-07T07:00:00')); // Jan 7 Wed
  });

  test('水曜10時（水曜07:00は過ぎ） → 金曜07:00', () => {
    const fromWed = d('2026-01-07T10:00:00');
    const next = nextWeeklyFireDate(fromWed, weekdays, H, M);
    expect(next).toEqual(d('2026-01-09T07:00:00')); // Jan 9 Fri
  });
});

// ─────────────────────────────────────────────
// 2週間に1度、月曜にリマインド (biweekly)
// ─────────────────────────────────────────────
describe('2週間ごと月曜にリマインド', () => {
  // anchorDate = 月曜 Jan 5 (これが「アクティブ週」の基点)
  const anchorDate = d('2026-01-05').getTime();
  const weekday = 1; // 月曜

  test('基点週（Jan 5 月 10:00） → 次のアクティブ月曜（Jan 19）', () => {
    const dates = computeBiweeklyFireDates(FROM, anchorDate, weekday, H, M, 3, 2);
    expect(dates[0]).toEqual(d('2026-01-19T07:00:00')); // 2週後 Jan 19
    expect(dates[1]).toEqual(d('2026-02-02T07:00:00')); // 4週後 Feb 2
    expect(dates[2]).toEqual(d('2026-02-16T07:00:00')); // 6週後 Feb 16
  });

  test('3週間ごとも対応', () => {
    const dates = computeBiweeklyFireDates(FROM, anchorDate, weekday, H, M, 2, 3);
    expect(dates[0]).toEqual(d('2026-01-26T07:00:00')); // 3週後 Jan 26
  });
});

// ─────────────────────────────────────────────
// 毎年1月1日にリマインド (yearly)
// ─────────────────────────────────────────────
describe('毎年1月1日にリマインド', () => {
  test('Jan 5 時点では当年 Jan 1 は過去 → 来年 Jan 1', () => {
    const dates = computeYearlyFireDates(FROM, 0, 1, H, M, 3); // month=0 → January
    expect(dates[0]).toEqual(d('2027-01-01T07:00:00'));
    expect(dates[1]).toEqual(d('2028-01-01T07:00:00'));
    expect(dates[2]).toEqual(d('2029-01-01T07:00:00'));
  });

  test('2月末日（月ごとに最終日が変わる）', () => {
    // Feb 29 → 2028年(閏年)は29日、2026/2027は28日
    const dates = computeYearlyFireDates(FROM, 1, 29, H, M, 3); // Feb 29
    expect(dates[0].getFullYear()).toBe(2026);
    expect(dates[0].getDate()).toBe(28); // 2026年は平年 → 28日
    expect(dates[1].getFullYear()).toBe(2027);
    expect(dates[1].getDate()).toBe(28); // 2027年も平年 → 28日
    expect(dates[2].getFullYear()).toBe(2028);
    expect(dates[2].getDate()).toBe(29); // 2028年は閏年 → 29日
  });
});

// ─────────────────────────────────────────────
// 月末にリマインド (monthly + MONTH_END)
// ─────────────────────────────────────────────
describe('月末にリマインド', () => {
  test('1月: 31日', () => {
    const dates = computeMonthlyQueueFireDates(FROM, [MONTH_END], H, M, 3);
    expect(dates[0]).toEqual(d('2026-01-31T07:00:00'));
    expect(dates[1]).toEqual(d('2026-02-28T07:00:00')); // 平年2月 → 28日
    expect(dates[2]).toEqual(d('2026-03-31T07:00:00'));
  });

  test('月末+15日: 毎月2回通知', () => {
    const dates = computeMonthlyQueueFireDates(FROM, [15, MONTH_END], H, M, 4);
    expect(dates[0]).toEqual(d('2026-01-15T07:00:00'));
    expect(dates[1]).toEqual(d('2026-01-31T07:00:00'));
    expect(dates[2]).toEqual(d('2026-02-15T07:00:00'));
    expect(dates[3]).toEqual(d('2026-02-28T07:00:00'));
  });

  test('2月: 29/30/99 がある場合、全て28日に収束（重複なし）', () => {
    // normalizeInput で 29/30 は除去済みのはずだが計算関数単体でも確認
    // 99のみの場合
    const dates = computeMonthlyQueueFireDates(
      d('2026-02-01T10:00:00'),
      [MONTH_END],
      H,
      M,
      1,
    );
    expect(dates[0]).toEqual(d('2026-02-28T07:00:00'));
    expect(dates.length).toBe(1);
  });
});

// ─────────────────────────────────────────────
// getNextFireDate (統合)
// ─────────────────────────────────────────────
describe('getNextFireDate (統合)', () => {
  const base = {
    id: 1,
    title: 'test',
    body: 'test',
    hour: H,
    minute: M,
    anchorDate: null,
    intervalDays: null,
    intervalMonths: null,
    nthWeek: null,
    nthWeekday: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('interval (毎日)', () => {
    const r = { ...base, kind: 'interval', intervalDays: 1, weekdays: null, monthdays: null };
    expect(getNextFireDate(r, FROM)).toEqual(d('2026-01-06T07:00:00'));
  });

  test('weekly 火曜', () => {
    const r = { ...base, kind: 'weekly', weekdays: [2], monthdays: null };
    expect(getNextFireDate(r, FROM)).toEqual(d('2026-01-06T07:00:00'));
  });

  test('weekdays なし → null', () => {
    const r = { ...base, kind: 'weekly', weekdays: null, monthdays: null };
    expect(getNextFireDate(r, FROM)).toBeNull();
  });

  test('monthly 月末', () => {
    const r = { ...base, kind: 'monthly', weekdays: null, monthdays: [MONTH_END] };
    expect(getNextFireDate(r, FROM)).toEqual(d('2026-01-31T07:00:00'));
  });

  test('yearly 1月1日', () => {
    const r = {
      ...base,
      kind: 'yearly',
      weekdays: null,
      monthdays: null,
      anchorDate: d('2026-01-01').getTime(),
    };
    expect(getNextFireDate(r, FROM)?.getFullYear()).toBe(2027);
    expect(getNextFireDate(r, FROM)?.getMonth()).toBe(0);
    expect(getNextFireDate(r, FROM)?.getDate()).toBe(1);
  });

  test('interval 2日ごと', () => {
    const r = {
      ...base,
      kind: 'interval',
      weekdays: null,
      monthdays: null,
      anchorDate: d('2026-01-05T07:00:00').getTime(),
      intervalDays: 2,
    };
    expect(getNextFireDate(r, FROM)).toEqual(d('2026-01-07T07:00:00'));
  });

  test('yearly 月末', () => {
    const r = {
      ...base,
      kind: 'yearly',
      weekdays: null,
      monthdays: [MONTH_END],
      anchorDate: d('2026-02-01').getTime(), // 2月月初（月末フラグ使用）
    };
    // Jan 5 時点では2026年2月末(Feb 28)はまだ未来
    const next = getNextFireDate(r, FROM);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(1); // February
    expect(next?.getDate()).toBe(28); // 平年
  });
});

// ─────────────────────────────────────────────
// 月跨ぎ・年またぎ
// ─────────────────────────────────────────────
describe('月跨ぎ・年またぎ', () => {
  test('monthly: 12月→1月 月跨ぎ', () => {
    // 12月31日 10時から、毎月1日
    const from = d('2026-12-31T10:00:00');
    const dates = computeMonthlyQueueFireDates(from, [1], H, M, 2);
    expect(dates[0]).toEqual(d('2027-01-01T07:00:00')); // 翌年1月1日
    expect(dates[1]).toEqual(d('2027-02-01T07:00:00')); // 翌年2月1日
  });

  test('monthly: 月末 12月→2月(平年)', () => {
    const from = d('2026-12-01T10:00:00');
    const dates = computeMonthlyQueueFireDates(from, [MONTH_END], H, M, 3);
    expect(dates[0]).toEqual(d('2026-12-31T07:00:00')); // 12月末
    expect(dates[1]).toEqual(d('2027-01-31T07:00:00')); // 1月末
    expect(dates[2]).toEqual(d('2027-02-28T07:00:00')); // 2月末(平年)
  });

  test('interval: 12月30日→1月1日(2日ごと)', () => {
    const from = d('2026-12-30T10:00:00');
    const anchor = d('2026-12-30T07:00:00').getTime();
    const dates = computeIntervalFireDates(from, anchor, 2, H, M, 2);
    expect(dates[0]).toEqual(d('2027-01-01T07:00:00')); // 年をまたぐ
    expect(dates[1]).toEqual(d('2027-01-03T07:00:00'));
  });

  test('yearly: 12月31日から毎年1月1日', () => {
    const from = d('2026-12-31T10:00:00');
    const dates = computeYearlyFireDates(from, 0, 1, H, M, 2); // 1月1日
    expect(dates[0]).toEqual(d('2027-01-01T07:00:00')); // 翌年
    expect(dates[1]).toEqual(d('2028-01-01T07:00:00'));
  });

  test('yearly 月末: 2月末 閏年をまたぐ場合', () => {
    // 2025年から毎年2月末 → 2028年は29日
    const from = d('2025-01-01T10:00:00');
    const dates = computeYearlyFireDates(from, 1, MONTH_END, H, M, 4); // 2月末
    expect(dates[0].getDate()).toBe(28); // 2025: 平年
    expect(dates[1].getDate()).toBe(28); // 2026: 平年
    expect(dates[2].getDate()).toBe(28); // 2027: 平年
    expect(dates[3].getDate()).toBe(29); // 2028: 閏年!
  });

  test('month_interval: 11月→翌2月(3ヶ月ごと)', () => {
    const anchor = d('2026-11-01').getTime(); // 11月起点
    // 11月15日を過ぎた後から → 次は2月15日
    const from = d('2026-11-20T10:00:00');
    const dates = computeMonthIntervalFireDates(from, anchor, 3, 15, H, M, 2);
    expect(dates[0]).toEqual(d('2027-02-15T07:00:00')); // 3ヶ月後: 2月(年またぎ)
    expect(dates[1]).toEqual(d('2027-05-15T07:00:00')); // 6ヶ月後: 5月
  });

  test('biweekly: 12月→1月 年またぎ', () => {
    const anchor = d('2026-12-07').getTime(); // 12月第1月曜
    const from = d('2026-12-21T10:00:00'); // 12月第3月曜(アクティブ週)の10時
    const dates = computeBiweeklyFireDates(from, anchor, 1, H, M, 2, 2);
    expect(dates[0]).toEqual(d('2027-01-04T07:00:00')); // 翌年1月4日(月)
    expect(dates[0].getFullYear()).toBe(2027);
  });
});
