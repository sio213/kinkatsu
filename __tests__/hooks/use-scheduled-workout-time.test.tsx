// useScheduledWorkoutTime は「まだ読み込み中」と「読み込み済みだが対象行が無い（削除済み）」を
// 呼び出し側で区別できるよう loaded を分けて返す。これが潰れると、予定の編集画面から自分自身を
// 削除した直後に NotFound 表示がフラッシュする（@designer指摘）。その分岐を固定する。
/* eslint-disable no-var */
var mockLiveQueryResult: { data?: unknown };

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnThis() }),
      }),
    }),
  },
}));

jest.mock('@/db/schema', () => ({
  scheduledWorkouts: {
    id: 'id',
    scheduledDate: 'scheduledDate',
    hour: 'hour',
    minute: 'minute',
    routineId: 'routineId',
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryResult),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useScheduledWorkoutTime } from '@/hooks/use-scheduled-workout';

function mount() {
  let captured: ReturnType<typeof useScheduledWorkoutTime>;
  function Harness() {
    captured = useScheduledWorkoutTime(42);
    return null;
  }
  act(() => {
    create(React.createElement(Harness));
  });
  return captured!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useScheduledWorkoutTime', () => {
  it('読み込み前は time=null / loaded=false を返す', () => {
    mockLiveQueryResult = { data: undefined };

    expect(mount()).toEqual({ time: null, loaded: false });
  });

  it('行が取れたら日付・時刻・routineId をそのまま返す', () => {
    const row = { scheduledDate: '2026-08-01', hour: 19, minute: 30, routineId: 3 };
    mockLiveQueryResult = { data: [row] };

    expect(mount()).toEqual({ time: row, loaded: true });
  });

  it('直接予定（routineId が null）もそのまま返す', () => {
    const row = { scheduledDate: '2026-08-01', hour: 7, minute: 0, routineId: null };
    mockLiveQueryResult = { data: [row] };

    expect(mount().time).toEqual(row);
  });

  it('読み込み済みで対象行が無い（削除済み）ときは time=null だが loaded=true になる', () => {
    mockLiveQueryResult = { data: [] };

    expect(mount()).toEqual({ time: null, loaded: true });
  });
});
