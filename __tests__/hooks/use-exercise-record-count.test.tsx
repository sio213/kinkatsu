// useExerciseRecordCount は「種目詳細の初期タブを記録／解説どちらにするか」を決める。
// loaded の判定に data ではなく updatedAt を使っている点（dataは解決前から[]なので
// data !== undefined が常にtrueになる、という実機で踏んだ罠）がこのフックの肝なので、
// そこを中心に固定する。
/* eslint-disable no-var */
var mockLiveQueryResult: { data?: unknown; updatedAt?: Date; error?: Error };

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnThis() }),
    }),
  },
}));

jest.mock('@/db/schema', () => ({
  sets: { workoutSessionExerciseId: 'workoutSessionExerciseId', exerciseId: 'exerciseId', completedAt: 'completedAt' },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ and: args })),
  countDistinct: jest.fn((col: unknown) => ({ countDistinct: col })),
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  isNotNull: jest.fn((col: unknown) => ({ isNotNull: col })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryResult),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useExerciseRecordCount } from '@/hooks/use-exercise-record-count';

function mount() {
  let captured: ReturnType<typeof useExerciseRecordCount>;
  function Harness() {
    captured = useExerciseRecordCount(1);
    return null;
  }
  act(() => {
    create(React.createElement(Harness));
  });
  return captured!;
}

beforeEach(() => {
  mockLiveQueryResult = { data: [] };
  jest.clearAllMocks();
});

describe('useExerciseRecordCount', () => {
  it('解決前（updatedAtなし・dataは空配列）は loaded=false のままにする', () => {
    mockLiveQueryResult = { data: [] };

    expect(mount()).toEqual({ count: 0, loaded: false });
  });

  it('解決後は集計結果の件数を返す', () => {
    mockLiveQueryResult = { data: [{ count: 7 }], updatedAt: new Date() };

    expect(mount()).toEqual({ count: 7, loaded: true });
  });

  it('解決したが対象行が無ければ 0 件として扱う', () => {
    mockLiveQueryResult = { data: [], updatedAt: new Date() };

    expect(mount()).toEqual({ count: 0, loaded: true });
  });

  it('countがnullで返ってきても 0 にフォールバックする', () => {
    mockLiveQueryResult = { data: [{ count: null }], updatedAt: new Date() };

    expect(mount()).toEqual({ count: 0, loaded: true });
  });

  it('取得に失敗したときは画面が固まらないよう loaded=true / count=0 にフォールバックする', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLiveQueryResult = { data: [], error: new Error('boom') };

    expect(mount()).toEqual({ count: 0, loaded: true });
    expect(spy).toHaveBeenCalledWith('[exercise record count]', expect.any(Error));
    spy.mockRestore();
  });
});
