// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockRoutineExercisesSignal: unknown[] | undefined;
var mockUseLiveQuery: jest.Mock;

jest.mock('@/db/client', () => {
  const chain = {
    innerJoin: jest.fn().mockReturnThis(),
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
  routineExercises: { routineId: 'routineId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  exercises: { id: 'id', category: 'category' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ conds })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
}));

// フック内でuseLiveQueryが2回呼ばれる（①routineExercises単体の軽量購読=種目変更検知用、
// ②reminders起点のメインクエリ）ため、呼び出し順で戻り値を出し分ける
// （hooks/use-calendar-month-records.tsのテストと同じ考え方）
jest.mock('drizzle-orm/expo-sqlite', () => {
  const fn: jest.Mock = jest.fn((_query: unknown, _deps: unknown) => {
    const data = fn.mock.calls.length % 2 === 1 ? mockRoutineExercisesSignal : mockRows;
    return { data };
  });
  mockUseLiveQuery = fn;
  return { useLiveQuery: fn };
});

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
  mockRoutineExercisesSignal = undefined;
  mockUseLiveQuery.mockClear();
});

describe('useCalendarMonthSchedule', () => {
  it('データが未定義(初回ロード中)なら両方とも空のMapを返す', () => {
    mockRows = undefined;
    const getResult = renderHook(0, 1, 0);
    expect(getResult()).toEqual({ primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() });
  });

  it('毎日(interval)のルーティン紐付きリマインダーから、範囲内の日付ごとの代表カテゴリを算出する', () => {
    mockRows = [
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'chest',
        exerciseOrderIndex: 0,
      },
    ];
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 23).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('chest');
    expect(result.primaryCategoryByScheduleDay.get('2026-07-21')).toBe('chest');
    expect(result.primaryCategoryByScheduleDay.get('2026-07-22')).toBe('chest');
    expect(result.categorySetByScheduleDay.get('2026-07-20')).toEqual(new Set(['chest']));
  });

  it('同一ルーティンに複数種目がある場合、種目数最多のカテゴリを代表にする', () => {
    mockRows = [
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'chest',
        exerciseOrderIndex: 0,
      },
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'shoulder',
        exerciseOrderIndex: 1,
      },
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'shoulder',
        exerciseOrderIndex: 2,
      },
    ];
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    expect(getResult().primaryCategoryByScheduleDay.get('2026-07-20')).toBe('shoulder');
  });

  it('todayStartより前(rangeStart)を指定しても、過去日は結果に含めない(effectiveStart=todayStart)', () => {
    mockRows = [
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'chest',
        exerciseOrderIndex: 0,
      },
    ];
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
      {
        ...BASE_REMINDER,
        id: 1,
        routineId: 10,
        kind: 'interval',
        intervalDays: 1,
        hour: 19,
        minute: 0,
        exerciseCategory: 'leg',
        exerciseOrderIndex: 0,
      },
      {
        ...BASE_REMINDER,
        id: 2,
        routineId: 20,
        kind: 'interval',
        intervalDays: 1,
        hour: 7,
        minute: 0,
        exerciseCategory: 'chest',
        exerciseOrderIndex: 0,
      },
    ];
    const todayStart = new Date(2026, 6, 20).getTime();
    const rangeEnd = new Date(2026, 6, 21).getTime();
    const getResult = renderHook(todayStart, rangeEnd, todayStart);
    const result = getResult();
    expect(result.primaryCategoryByScheduleDay.get('2026-07-20')).toBe('chest');
    expect(result.categorySetByScheduleDay.get('2026-07-20')).toEqual(new Set(['leg', 'chest']));
  });

  it('useLiveQueryを2回呼ぶ（①routineExercises単体の軽量購読 ②reminders起点のメインクエリ）', () => {
    const todayStart = new Date(2026, 6, 20).getTime();
    renderHook(todayStart, todayStart + 1, todayStart);
    expect(mockUseLiveQuery).toHaveBeenCalledTimes(2);
  });

  it('メインクエリのuseLiveQueryには、routineExercises側の購読結果をdepsとして渡す（ルーティンの種目編集がリマインダー本体の更新を伴わなくても再フェッチさせるため）', () => {
    mockRoutineExercisesSignal = [{ id: 999, routineId: 10 }];
    mockRows = [];
    const todayStart = new Date(2026, 6, 20).getTime();
    renderHook(todayStart, todayStart + 1, todayStart);
    const secondCallArgs = mockUseLiveQuery.mock.calls[1];
    expect(secondCallArgs[1]).toEqual([mockRoutineExercisesSignal]);
  });
});
