// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockLiveQueryQueue: { data: unknown }[];
// where()に渡された引数を後からテストで検証できるよう、chainをモジュールスコープに出す
var mockWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockWhere = jest.fn().mockReturnThis();
  const chain = {
    innerJoin: jest.fn().mockReturnThis(),
    where: mockWhere,
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
  ne: jest.fn((col, val) => ({ col, val, op: 'ne' })),
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
import { ne } from 'drizzle-orm';
import { workoutSessionExercises } from '@/db/schema';
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

describe('useExerciseUsageStats: excludeSessionId', () => {
  function mountWith(excludeSessionId: number | undefined) {
    mockLiveQueryQueue = [{ data: [] }];
    act(() => {
      create(
        React.createElement(function Harness() {
          useExerciseUsageStats(excludeSessionId);
          return null;
        }),
      );
    });
  }

  it('excludeSessionId省略時はwhereにundefinedを渡す（従来どおり全セッションが対象になる）', () => {
    mountWith(undefined);
    expect(mockWhere).toHaveBeenCalledWith(undefined);
  });

  it('excludeSessionId指定時はne(workoutSessionExercises.sessionId, excludeSessionId)の条件でwhereを呼ぶ', () => {
    mountWith(42);
    expect(ne).toHaveBeenCalledWith(workoutSessionExercises.sessionId, 42);
  });

  it('excludeSessionId=0でも除外条件が有効になる（if(excludeSessionId)のようなtruthyチェックへの後退を防ぐ）', () => {
    mountWith(0);
    expect(ne).toHaveBeenCalledWith(workoutSessionExercises.sessionId, 0);
  });
});
