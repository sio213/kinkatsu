// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
// useLiveQuery はhook呼び出し順に消費するキュー
var mockLiveQueryQueue: { data: unknown }[];

jest.mock('@/db/client', () => {
  const chain = {
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return {
    db: {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessions: { id: 'id', startedAt: 'startedAt', endedAt: 'endedAt' },
  sets: { sessionId: 'sessionId', weight: 'weight', reps: 'reps' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ col, dir: 'desc' })),
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
import {
  useSessionSetCount,
  useSessionStats,
  useWorkoutSession,
  useWorkoutSessions,
} from '@/hooks/use-workout-session';

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

describe('useWorkoutSessions', () => {
  const mount = makeHarness(useWorkoutSessions);

  it('sessionsがundefinedのとき空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const { sessions } = mount();
    expect(sessions).toEqual([]);
  });

  it('endedAtがnullのセッションをactiveSessionとして検出する', () => {
    const inProgress = { id: 5, startedAt: 100, endedAt: null };
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [inProgress, finished] }];
    const { activeSession } = mount();
    expect(activeSession).toEqual(inProgress);
  });

  it('endedAtがnullのセッションが複数件ある場合、配列先頭（startedAt降順の最新）をactiveSessionとする', () => {
    const newer = { id: 6, startedAt: 200, endedAt: null };
    const older = { id: 5, startedAt: 100, endedAt: null };
    mockLiveQueryQueue = [{ data: [newer, older] }];
    const { activeSession } = mount();
    expect(activeSession).toEqual(newer);
  });

  it('進行中セッションが無ければactiveSessionはnull', () => {
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [finished] }];
    const { activeSession } = mount();
    expect(activeSession).toBeNull();
  });
});

describe('useWorkoutSession', () => {
  const mountSingle = makeHarness(() => useWorkoutSession(1));

  it('data=undefined のとき loaded=false', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const { session, loaded } = mountSingle();
    expect(session).toBeUndefined();
    expect(loaded).toBe(false);
  });

  it('data=[] のとき loaded=true・sessionはundefined（見つからない）', () => {
    mockLiveQueryQueue = [{ data: [] }];
    const { session, loaded } = mountSingle();
    expect(session).toBeUndefined();
    expect(loaded).toBe(true);
  });

  it('data=[session] のときそのセッションを返す', () => {
    const fake = { id: 1, startedAt: 0, endedAt: null };
    mockLiveQueryQueue = [{ data: [fake] }];
    const { session, loaded } = mountSingle();
    expect(session).toBe(fake);
    expect(loaded).toBe(true);
  });
});

describe('useSessionStats', () => {
  const mount = makeHarness(useSessionStats);

  it('dataがundefinedのとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('SQL側で集計済みの行をsessionIdをキーにしたMapに変換する', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { sessionId: 1, setCount: 3, totalVolume: 1520 },
          { sessionId: 2, setCount: 1, totalVolume: 240 },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({ setCount: 3, totalVolume: 1520 });
    expect(result.get(2)).toEqual({ setCount: 1, totalVolume: 240 });
    expect(result.get(3)).toBeUndefined();
  });
});

describe('useSessionSetCount', () => {
  const mount = makeHarness(() => useSessionSetCount(1));

  it('dataがundefinedのとき0を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    expect(mount()).toBe(0);
  });

  it('集計行のcountをそのまま返す', () => {
    mockLiveQueryQueue = [{ data: [{ count: 4 }] }];
    expect(mount()).toBe(4);
  });
});
