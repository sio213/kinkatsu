import type { Reminder } from '@/db/schema';
import { formatKindSummary, formatNextFire } from '@/lib/notifications/format';

describe('formatNextFire', () => {
  const now = new Date(2026, 6, 5, 8, 0);

  test('returns em dash when date is null', () => {
    expect(formatNextFire(null, now)).toBe('—');
  });

  test('shows 今日 when the date is later today', () => {
    const today = new Date(2026, 6, 5, 21, 30);
    expect(formatNextFire(today, now)).toBe('次回: 今日 21:30');
  });

  test('shows 明日 for tomorrow', () => {
    const tomorrow = new Date(2026, 6, 6, 9, 0);
    expect(formatNextFire(tomorrow, now)).toBe('次回: 明日 09:00');
  });

  test('shows the date (not 明日) for the day after tomorrow', () => {
    const dayAfterTomorrow = new Date(2026, 6, 7, 9, 0);
    expect(formatNextFire(dayAfterTomorrow, now)).toBe('次回: 7/7 09:00');
  });

  test('shows just the date further out', () => {
    const later = new Date(2026, 6, 10, 9, 0);
    expect(formatNextFire(later, now)).toBe('次回: 7/10 09:00');
  });
});

describe('formatKindSummary: weekly', () => {
  const base: Reminder = {
    id: 1,
    routineId: null,
    title: 't',
    body: 'b',
    kind: 'weekly',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: null,
    intervalDays: 7,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('曜日1つは「毎週 {曜日}」で表示される', () => {
    const r: Reminder = { ...base, weekdays: '[1]' };
    expect(formatKindSummary(r)).toBe('毎週 月 07:00');
  });

  test('曜日5つ以下は「・」区切りで個別列挙される', () => {
    const r: Reminder = { ...base, weekdays: '[1,3,5]' };
    expect(formatKindSummary(r)).toBe('毎週 月・水・金 07:00');
  });

  test('曜日ちょうど5つでも個別列挙される（6未満の境界値）', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4]' };
    expect(formatKindSummary(r)).toBe('毎週 日・月・火・水・木 07:00');
  });

  test('曜日6つは個別列挙せず「週6回」に集約される（境界値）', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4,5]' };
    expect(formatKindSummary(r)).toBe('週6回 07:00');
  });

  test('曜日7つ(全曜日)は「毎日」に集約される', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4,5,6]' };
    expect(formatKindSummary(r)).toBe('毎日 07:00');
  });

  test('N週ごと(interval週>1)でも曜日5つ以下は「N週ごと {曜日}」で表示される', () => {
    const r: Reminder = { ...base, weekdays: '[1,4]', intervalDays: 14 };
    expect(formatKindSummary(r)).toBe('2週ごと 月・木 07:00');
  });

  test('N週ごと(interval週>1)でちょうど5曜日でも個別列挙される（6未満の境界値）', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4]', intervalDays: 14 };
    expect(formatKindSummary(r)).toBe('2週ごと 日・月・火・水・木 07:00');
  });

  test('N週ごと(interval週>1)で曜日6つでも集約せず「N週ごと」の接頭辞付きで個別列挙される（毎週専用の集約と衝突させない）', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4,5]', intervalDays: 14 };
    expect(formatKindSummary(r)).toBe('2週ごと 日・月・火・水・木・金 07:00');
  });

  test('N週ごと(interval週>1)で全7曜日でも「毎日」にはならない（真の毎日設定と表記が衝突するバグの回帰防止）', () => {
    const r: Reminder = { ...base, weekdays: '[0,1,2,3,4,5,6]', intervalDays: 14 };
    expect(formatKindSummary(r)).toBe('2週ごと 日・月・火・水・木・金・土 07:00');
  });

  test('曜日が未設定(null)の場合でも例外を投げない（表示は崩れるが壊れた既存挙動として固定する）', () => {
    const r: Reminder = { ...base, weekdays: null };
    expect(formatKindSummary(r)).toBe('毎週  07:00');
  });

  test('曜日配列に重複がある場合、配列長だけで判定するため実質1曜日でも「週6回」等に誤集約されうる（既知の制限として固定する）', () => {
    const r: Reminder = { ...base, weekdays: '[1,1,1,1,1,1]' };
    expect(formatKindSummary(r)).toBe('週6回 07:00');
  });
});

describe('formatKindSummary: interval', () => {
  const base: Reminder = {
    id: 1,
    routineId: null,
    title: 't',
    body: 'b',
    kind: 'interval',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: null,
    intervalDays: null,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('intervalDaysが未設定(null)なら「毎日」扱いになる', () => {
    const r: Reminder = { ...base, intervalDays: null };
    expect(formatKindSummary(r)).toBe('毎日 07:00');
  });

  test('intervalDaysが1なら「毎日」と表示される', () => {
    const r: Reminder = { ...base, intervalDays: 1 };
    expect(formatKindSummary(r)).toBe('毎日 07:00');
  });

  test('intervalDaysが2以上なら「N日ごと」と表示される', () => {
    const r: Reminder = { ...base, intervalDays: 3 };
    expect(formatKindSummary(r)).toBe('3日ごと 07:00');
  });

  test('intervalDaysが大きい値(境界に近い365)でも「N日ごと」と表示される', () => {
    const r: Reminder = { ...base, intervalDays: 365 };
    expect(formatKindSummary(r)).toBe('365日ごと 07:00');
  });
});

describe('formatKindSummary: monthly (通常の日付指定)', () => {
  const base: Reminder = {
    id: 1,
    routineId: null,
    title: 't',
    body: 'b',
    kind: 'monthly',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: null,
    intervalDays: null,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('単一日付は「毎月 {日}日」で表示される', () => {
    const r: Reminder = { ...base, monthdays: '[1]' };
    expect(formatKindSummary(r)).toBe('毎月 1日 07:00');
  });

  test('複数日付は「・」区切りで表示される', () => {
    const r: Reminder = { ...base, monthdays: '[1,15]' };
    expect(formatKindSummary(r)).toBe('毎月 1日・15日 07:00');
  });

  test('月末と通常日が混在する場合、「月末」と数値日付が両方表示される', () => {
    const r: Reminder = { ...base, monthdays: '[1,99]' };
    expect(formatKindSummary(r)).toBe('毎月 1日・月末 07:00');
  });

  test('intervalMonths>1のときは「Nヶ月ごと」の接頭辞になる', () => {
    const r: Reminder = { ...base, intervalMonths: 3, monthdays: '[1]' };
    expect(formatKindSummary(r)).toBe('3ヶ月ごと 1日 07:00');
  });
});

describe('formatKindSummary: monthly 第N曜日', () => {
  const base: Reminder = {
    id: 1,
    routineId: null,
    title: 't',
    body: 'b',
    kind: 'monthly',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: null,
    intervalDays: null,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('複数曜日は「・」区切りで表示される', () => {
    const r: Reminder = { ...base, nthWeek: 2, nthWeekdays: '[1,3]' };
    expect(formatKindSummary(r)).toBe('毎月第2月・水曜日 07:00');
  });

  test('単一曜日でも従来通り表示される', () => {
    const r: Reminder = { ...base, nthWeek: 1, nthWeekdays: '[0]' };
    expect(formatKindSummary(r)).toBe('毎月第1日曜日 07:00');
  });
});

describe('formatKindSummary: yearly', () => {
  const base: Reminder = {
    id: 1,
    routineId: null,
    title: 't',
    body: 'b',
    kind: 'yearly',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: new Date(2026, 2, 1).getTime(), // 3月
    intervalDays: null,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('複数日付は「・」区切りで表示される', () => {
    const r: Reminder = { ...base, monthdays: '[1,15]' };
    expect(formatKindSummary(r)).toBe('毎年 3月1日・15日 07:00');
  });

  test('単一日付でも従来通り表示される', () => {
    const r: Reminder = { ...base, monthdays: '[1]' };
    expect(formatKindSummary(r)).toBe('毎年 3月1日 07:00');
  });

  test('月末を含む場合は「月末」と表示される', () => {
    const r: Reminder = { ...base, monthdays: '[99]' };
    expect(formatKindSummary(r)).toBe('毎年 3月月末 07:00');
  });

  test('monthdays未設定(旧形式)の場合、anchorDateの日をそのまま日付として使う', () => {
    // 以前anchorDateに発火日そのものをエンコードしていた旧形式データの後方互換フォールバック
    const r: Reminder = { ...base, monthdays: null, anchorDate: new Date(2026, 2, 15).getTime() };
    expect(formatKindSummary(r)).toBe('毎年 3月15日 07:00');
  });

  test('anchorDateが無ければ年表記にならず時刻のみ返す(不完全なデータのフォールスルー)', () => {
    const r: Reminder = { ...base, anchorDate: null };
    expect(formatKindSummary(r)).toBe('07:00');
  });
});
