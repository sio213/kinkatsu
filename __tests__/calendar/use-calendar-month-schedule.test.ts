// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockManualRows: unknown[] | undefined;
var mockSummaries: Map<number, { exerciseCount: number; categories: string[] }>;

jest.mock('@/db/client', () => {
  return {
    db: {
      select: jest.fn(() => ({
        from: jest.fn((table: string) => ({
          __table: table,
          where: jest.fn().mockReturnThis(),
        })),
      })),
    },
  };
});

// 文字列マーカーにしておき、useLiveQueryのモック側でどちらのテーブルへのクエリかを判別する
jest.mock('@/db/schema', () => ({
  reminders: 'reminders',
  scheduledWorkouts: 'scheduledWorkouts',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ conds })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn((query: { __table: string }) => ({
    data: query.__table === 'scheduledWorkouts' ? mockManualRows : mockRows,
  })),
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
  mockManualRows = undefined;
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

  it('手動予定(scheduledWorkouts、PR10)だけがある場合も、日付ごとの代表カテゴリに反映される', () => {
    mockManualRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-20', hour: 19, minute: 30 }];
    mockSummaries = new Map([[10, { exerciseCount: 2, categories: ['leg'] }]]);
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 23).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('leg');
    expect(result.categorySetByScheduleDay.get('2026-07-20')).toEqual(new Set(['leg']));
  });

  it('同日にリマインダー予定と手動予定の両方がある場合、時刻が早い方のカテゴリが代表になる', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 19, minute: 0 }];
    mockManualRows = [{ id: 1, routineId: 20, scheduledDate: '2026-07-20', hour: 7, minute: 0 }];
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

  it('手動予定もsummariesに代表カテゴリが無いルーティン(種目0件)は対象外', () => {
    mockManualRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-20', hour: 19, minute: 30 }];
    mockSummaries = new Map(); // routineId=10のエントリなし
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    expect(getResult().primaryCategoryByScheduleDay.size).toBe(0);
  });

  it('手動予定も範囲外([effectiveStart, rangeEnd)外)の日付は対象外', () => {
    mockManualRows = [
      { id: 1, routineId: 10, scheduledDate: '2026-06-30', hour: 19, minute: 30 }, // todayStartより前
      { id: 2, routineId: 10, scheduledDate: '2026-07-23', hour: 19, minute: 30 }, // rangeEnd以降
      { id: 3, routineId: 10, scheduledDate: '2026-07-20', hour: 19, minute: 30 }, // 範囲内
    ];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['leg'] }]]);
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 23).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.has('2026-06-30')).toBe(false);
    expect(result.primaryCategoryByScheduleDay.has('2026-07-23')).toBe(false);
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('leg');
  });
});
