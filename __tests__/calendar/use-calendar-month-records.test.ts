// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockLiveQueryData: unknown[] | undefined;

jest.mock('@/db/client', () => {
  const chain = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };
  return {
    db: {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessions: { id: 'id', startedAt: 'startedAt', endedAt: 'endedAt' },
  sets: { id: 'id', sessionId: 'sessionId', workoutSessionExerciseId: 'workoutSessionExerciseId', completedAt: 'completedAt' },
  exercises: { id: 'id', category: 'category' },
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ conds })),
  gte: jest.fn((col, val) => ({ col, val, op: 'gte' })),
  lt: jest.fn((col, val) => ({ col, val, op: 'lt' })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
  asc: jest.fn((col) => ({ col, dir: 'asc' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: mockLiveQueryData })),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCalendarMonthRecords, type CalendarMonthRecords } from '@/hooks/use-calendar-month-records';

function renderHook(startMs: number, endMs: number) {
  let result: CalendarMonthRecords | undefined;
  function Probe() {
    result = useCalendarMonthRecords(startMs, endMs);
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  return () => result!;
}

beforeEach(() => {
  mockLiveQueryData = undefined;
});

describe('useCalendarMonthRecords', () => {
  it('useLiveQueryの結果が未定義(初回ロード中)なら両方とも空のMapを返す', () => {
    mockLiveQueryData = undefined;
    const getResult = renderHook(0, 1);
    expect(getResult()).toEqual({ primaryCategoryByDay: new Map(), categorySetByDay: new Map() });
  });

  it('取得した行をtoDateKeyでローカル日付キーに変換し、日別代表カテゴリ・日別カテゴリ集合のMapを返す', () => {
    mockLiveQueryData = [
      { startedAt: new Date(2026, 6, 16, 7, 0).getTime(), category: 'chest' },
      { startedAt: new Date(2026, 6, 16, 7, 0).getTime(), category: 'chest' },
      { startedAt: new Date(2026, 6, 17, 20, 0).getTime(), category: 'leg' },
    ];
    const getResult = renderHook(0, Number.MAX_SAFE_INTEGER);
    expect(getResult()).toEqual({
      primaryCategoryByDay: new Map([
        ['2026-07-16', 'chest'],
        ['2026-07-17', 'leg'],
      ]),
      categorySetByDay: new Map([
        ['2026-07-16', new Set(['chest'])],
        ['2026-07-17', new Set(['leg'])],
      ]),
    });
  });
});
