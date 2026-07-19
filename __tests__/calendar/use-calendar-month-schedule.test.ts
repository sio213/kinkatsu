// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockSummaries: Map<number, { exerciseCount: number; categories: string[] }>;

jest.mock('@/db/client', () => {
  const chain = {
    where: jest.fn().mockReturnThis(),
  };
  return {
    db: {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  reminders: { id: 'id', routineId: 'routineId', enabled: 'enabled' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ conds })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: mockRows })),
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutineExerciseSummaries: () => mockSummaries,
}));

// lib/notifications/scheduler.ts経由でexpo-notificationsが読み込まれる（getFireDatesInRange/
// parseReminderの再エクスポート元）ため、他のテスト(scheduler.test.ts)と同様にモックしておく
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
}));
jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCalendarMonthSchedule, type CalendarMonthSchedule } from '@/hooks/use-calendar-month-schedule';

function renderHook(rangeStart: number, rangeEnd: number, todayStart: number) {
  let result: CalendarMonthSchedule | undefined;
  function Probe() {
    result = useCalendarMonthSchedule(rangeStart, rangeEnd, todayStart);
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  return () => result!;
}

const BASE_REMINDER = {
  title: 'test',
  body: 'test',
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

beforeEach(() => {
  mockRows = undefined;
  mockSummaries = new Map();
});

describe('useCalendarMonthSchedule', () => {
  it('データが未定義(初回ロード中)なら両方とも空のMapを返す', () => {
    mockRows = undefined;
    const getResult = renderHook(0, 1, 0);
    expect(getResult()).toEqual({ primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() });
  });

  it('毎日(interval)のルーティン紐付きリマインダーから、範囲内の日付ごとの代表カテゴリを算出する', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 23).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('chest');
    expect(result.primaryCategoryByScheduleDay.get('2026-07-21')).toBe('chest');
    expect(result.primaryCategoryByScheduleDay.get('2026-07-22')).toBe('chest');
    expect(result.categorySetByScheduleDay.get('2026-07-20')).toEqual(new Set(['chest']));
  });

  it('summariesに代表カテゴリが無いルーティン(種目0件)のリマインダーは対象外', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map(); // routineId=10のエントリなし
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    expect(getResult().primaryCategoryByScheduleDay.size).toBe(0);
  });

  it('categoriesの先頭（種目数最多、既存のuseRoutineExerciseSummariesの並び順）が代表カテゴリになる', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map([[10, { exerciseCount: 3, categories: ['shoulder', 'chest'] }]]);
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    expect(getResult().primaryCategoryByScheduleDay.get('2026-07-20')).toBe('shoulder');
  });

  it('todayStartより前(rangeStart)を指定しても、過去日は結果に含めない(effectiveStart=todayStart)', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    const rangeStart = new Date(2026, 5, 1).getTime(); // 前月から開始(実績側のrangeと同じ想定)
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(rangeStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.has('2026-06-15')).toBe(false);
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('chest');
  });

  it('2つのルーティンが同日に予定されている場合、時刻が早い方のカテゴリが代表になる', () => {
    mockRows = [
      { ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 19, minute: 0 },
      { ...BASE_REMINDER, id: 2, routineId: 20, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 },
    ];
    mockSummaries = new Map([
      [10, { exerciseCount: 1, categories: ['leg'] }],
      [20, { exerciseCount: 1, categories: ['chest'] }],
    ]);
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('chest');
    expect(result.categorySetByScheduleDay.get('2026-07-20')).toEqual(new Set(['leg', 'chest']));
  });
});
