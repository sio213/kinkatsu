// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockLiveQueryData: unknown[] | undefined;
var mockSessionsSignalData: unknown[] | undefined;
var mockUseLiveQuery: jest.Mock;

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

// フック内でuseLiveQueryが2回呼ばれる（①workoutSessionsだけの軽量な購読=session変更検知用、
// ②sets起点のメインクエリ）ため、呼び出し順で戻り値を出し分ける。①の戻り値はdeps経由で
// ②の再購読トリガーに使われるだけでデータ内容自体は参照されないため、mockSessionsSignalDataは
// 「参照が変わったこと」を検証する目的でのみ使う
jest.mock('drizzle-orm/expo-sqlite', () => {
  const fn: jest.Mock = jest.fn((_query: unknown, _deps: unknown) => {
    const data = fn.mock.calls.length % 2 === 1 ? mockSessionsSignalData : mockLiveQueryData;
    return { data };
  });
  mockUseLiveQuery = fn;
  return { useLiveQuery: fn };
});

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
  mockSessionsSignalData = undefined;
  mockUseLiveQuery.mockClear();
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

  it('useLiveQueryを2回呼ぶ（①workoutSessions単体の軽量購読 ②sets起点のメインクエリ）', () => {
    renderHook(0, Number.MAX_SAFE_INTEGER);
    expect(mockUseLiveQuery).toHaveBeenCalledTimes(2);
  });

  it('メインクエリのuseLiveQueryには、[startMs, endMs, workoutSessions側の購読結果]をdepsとして渡す（トレーニング終了時にsetsテーブルへの書き込みが無くても再フェッチさせるため）', () => {
    // mockLiveQueryData（②メインクエリの戻り値）と区別可能な値にしておき、
    // depsに渡っているのが確かに①(sessionsInRangeSignal)の戻り値であって
    // ②自身の戻り値ではないことを判別できるようにする
    mockSessionsSignalData = [{ id: 999, endedAt: 123 }];
    mockLiveQueryData = [];
    renderHook(0, Number.MAX_SAFE_INTEGER);
    // 2回目の呼び出し（メインクエリ）の第2引数(deps)が配列であり、①の戻り値を含んでいること
    const secondCallArgs = mockUseLiveQuery.mock.calls[1];
    expect(secondCallArgs[1]).toEqual([0, Number.MAX_SAFE_INTEGER, mockSessionsSignalData]);
  });

  it('軽量購読(①)のuseLiveQueryには[startMs, endMs]をdepsとして渡す（月送りでrangeが変わったときに再購読させるため）', () => {
    renderHook(123, 456);
    const firstCallArgs = mockUseLiveQuery.mock.calls[0];
    expect(firstCallArgs[1]).toEqual([123, 456]);
  });

  it('月送りでstartMs/endMsが変わったら、両方のuseLiveQueryのdepsも新しい範囲に更新される（マウント時のクロージャに固定されないこと）', () => {
    let startMs = 0;
    let endMs = 100;
    function Probe() {
      useCalendarMonthRecords(startMs, endMs);
      return null;
    }
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(React.createElement(Probe));
    });
    expect(mockUseLiveQuery.mock.calls[0][1]).toEqual([0, 100]);

    // 月送り相当: startMs/endMsを変えて再レンダーする
    startMs = 200;
    endMs = 300;
    act(() => {
      root.update(React.createElement(Probe));
    });
    const calls = mockUseLiveQuery.mock.calls;
    // 再レンダーで軽量購読(①)・メインクエリ(②)とも新しいrangeで再度呼ばれていること
    expect(calls[calls.length - 2][1]).toEqual([200, 300]);
    expect(calls[calls.length - 1][1]).toEqual([200, 300, mockSessionsSignalData]);
  });
});
