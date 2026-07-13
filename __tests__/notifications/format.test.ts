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
});
