// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockLiveQueryQueue: { data: unknown }[];

jest.mock('@/db/client', () => {
  const chain = {
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
  };
  return {
    db: {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId', exerciseId: 'exerciseId' },
  workoutSessions: { id: 'id', startedAt: 'startedAt' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  sql: Object.assign(
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    { raw: jest.fn() },
  ),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryQueue.shift() ?? { data: undefined }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useExerciseUsageStats } from '@/hooks/use-exercise-usage-stats';

function makeHarness<T>(hook: () => T) {
  let captured: T;
  function Harness() {
    captured = hook();
    return null;
  }
  return () => {
    act(() => {
      create(React.createElement(Harness));
    });
    return captured!;
  };
}

beforeEach(() => {
  mockLiveQueryQueue = [];
  jest.clearAllMocks();
});

describe('useExerciseUsageStats', () => {
  const mount = makeHarness(useExerciseUsageStats);

  it('dataがundefinedのとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('dataが空配列のときも空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: [] }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('SQL側で集計済みの行をexerciseIdをキーにしたMapに変換する', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { exerciseId: 1, recentUsageCount: 5, lastUsedAt: 1_700_000_000_000 },
          { exerciseId: 2, recentUsageCount: 0, lastUsedAt: 1_600_000_000_000 },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({ recentUsageCount: 5, lastUsedAt: 1_700_000_000_000 });
    expect(result.get(2)).toEqual({ recentUsageCount: 0, lastUsedAt: 1_600_000_000_000 });
    expect(result.get(3)).toBeUndefined();
  });

  it('liveQueryのdataの参照が変わらなければ、再レンダーしても同じMap参照を返す', () => {
    const rows = [{ exerciseId: 1, recentUsageCount: 2, lastUsedAt: 100 }];
    const captured: Map<number, unknown>[] = [];
    let triggerRerender!: () => void;

    function Harness() {
      const [, forceUpdate] = React.useReducer((c: number) => c + 1, 0);
      triggerRerender = () => forceUpdate();
      captured.push(useExerciseUsageStats());
      return null;
    }

    mockLiveQueryQueue = [{ data: rows }, { data: rows }];
    act(() => {
      create(React.createElement(Harness));
    });
    act(() => {
      triggerRerender();
    });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
  });
});
