// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockReturning: jest.Mock;
// useLiveQuery はhook呼び出し順に消費するキュー。useWorkoutSessionsは
// [セッション一覧, 全セット] の順に2回呼ぶため、この順でpushする
var mockLiveQueryQueue: { data: unknown }[];

jest.mock('@/db/client', () => {
  mockReturning = jest.fn().mockResolvedValue([{ id: 1, startedAt: 0, endedAt: null }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: () => mockReturning() });
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });

  const mockFrom = jest.fn().mockReturnValue({
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnValue({ limit: jest.fn() }),
  });

  return {
    db: {
      select: jest.fn().mockReturnValue({ from: mockFrom }),
      insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockInsertValues(...args) }),
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockUpdateSet(...args) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessions: { id: 'id', startedAt: 'startedAt', endedAt: 'endedAt' },
  sets: { sessionId: 'sessionId' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ col, dir: 'desc' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryQueue.shift() ?? { data: undefined }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useWorkoutSession, useWorkoutSessions } from '@/hooks/use-workout-session';

type SessionsHookResult = ReturnType<typeof useWorkoutSessions>;
let captured: SessionsHookResult;

function Harness() {
  captured = useWorkoutSessions();
  return null;
}

function mount() {
  act(() => {
    create(React.createElement(Harness));
  });
  return captured;
}

type SingleHookResult = ReturnType<typeof useWorkoutSession>;
let capturedSingle: SingleHookResult;

function SingleHarness({ id }: { id: number }) {
  capturedSingle = useWorkoutSession(id);
  return null;
}

function mountSingle(id: number) {
  act(() => {
    create(React.createElement(SingleHarness, { id }));
  });
  return capturedSingle;
}

beforeEach(() => {
  mockLiveQueryQueue = [];
  jest.clearAllMocks();
});

describe('useWorkoutSessions', () => {
  it('sessions/setsがundefinedのとき空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }, { data: undefined }];
    const { sessions, sets } = mount();
    expect(sessions).toEqual([]);
    expect(sets).toEqual([]);
  });

  it('endedAtがnullのセッションをactiveSessionとして検出する', () => {
    const inProgress = { id: 5, startedAt: 100, endedAt: null };
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [inProgress, finished] }, { data: [] }];
    const { activeSession } = mount();
    expect(activeSession).toEqual(inProgress);
  });

  it('進行中セッションが無ければactiveSessionはnull', () => {
    const finished = { id: 4, startedAt: 0, endedAt: 60_000 };
    mockLiveQueryQueue = [{ data: [finished] }, { data: [] }];
    const { activeSession } = mount();
    expect(activeSession).toBeNull();
  });

  it('startSession: 現在時刻でinsertし、insertされた行を返す', async () => {
    mockLiveQueryQueue = [{ data: [] }, { data: [] }];
    const { startSession } = mount();
    const before = Date.now();
    let result: Awaited<ReturnType<typeof startSession>>;
    await act(async () => {
      result = await startSession();
    });
    const after = Date.now();
    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.startedAt).toBeGreaterThanOrEqual(before);
    expect(payload.startedAt).toBeLessThanOrEqual(after);
    expect(payload.createdAt).toBe(payload.startedAt);
    expect(payload.updatedAt).toBe(payload.startedAt);
    expect(result!).toEqual({ id: 1, startedAt: 0, endedAt: null });
  });

  it('endSession: endedAtを現在時刻でupdateする', async () => {
    mockLiveQueryQueue = [{ data: [] }, { data: [] }];
    const { endSession } = mount();
    await act(async () => {
      await endSession(5);
    });
    const payload = mockUpdateSet.mock.calls[0][0];
    expect(typeof payload.endedAt).toBe('number');
    expect(mockUpdateWhere).toHaveBeenCalledWith({ col: 'id', val: 5 });
  });
});

describe('useWorkoutSession', () => {
  it('data=undefined のとき loaded=false', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    const { session, loaded } = mountSingle(1);
    expect(session).toBeUndefined();
    expect(loaded).toBe(false);
  });

  it('data=[] のとき loaded=true・sessionはundefined（見つからない）', () => {
    mockLiveQueryQueue = [{ data: [] }];
    const { session, loaded } = mountSingle(1);
    expect(session).toBeUndefined();
    expect(loaded).toBe(true);
  });

  it('data=[session] のときそのセッションを返す', () => {
    const fake = { id: 1, startedAt: 0, endedAt: null };
    mockLiveQueryQueue = [{ data: [fake] }];
    const { session, loaded } = mountSingle(1);
    expect(session).toBe(fake);
    expect(loaded).toBe(true);
  });
});
