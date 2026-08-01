// useRoutines は一覧の購読と lib/routines/db への委譲だけの薄い層だが、引数の受け渡しを
// 取り違えると「リマインダー付きで作ったのに通知が付かない」のような静かな不具合になる。
// 集計側（useRoutineExerciseSummaries / useRoutineReminders）は use-routines.test.ts が
// 見ているので、ここは未検証だった useRoutines に絞る。
/* eslint-disable no-var */
var mockLiveQueryResult: { data?: unknown };
var mockRoutinesDb: Record<string, jest.Mock>;

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
      }),
    }),
  },
}));

jest.mock('@/db/schema', () => ({
  routines: { id: 'id', orderIndex: 'orderIndex' },
  routineExercises: { routineId: 'routineId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  exercises: { id: 'id', category: 'category' },
  reminders: { routineId: 'routineId' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  isNotNull: jest.fn((col: unknown) => ({ isNotNull: col })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryResult),
}));

jest.mock('@/lib/routines/db', () => {
  mockRoutinesDb = {
    createRoutine: jest.fn(async () => 1),
    updateRoutine: jest.fn(async () => undefined),
    deleteRoutine: jest.fn(async () => undefined),
    swapRoutineOrder: jest.fn(async () => undefined),
    duplicateRoutine: jest.fn(async () => 2),
  };
  return mockRoutinesDb;
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { Routine } from '@/db/schema';
import { useRoutines } from '@/hooks/use-routines';

function mount() {
  let captured: ReturnType<typeof useRoutines>;
  function Harness() {
    captured = useRoutines();
    return null;
  }
  act(() => {
    create(React.createElement(Harness));
  });
  return captured!;
}

const routine = { id: 1, name: '胸の日', orderIndex: 0 } as unknown as Routine;

beforeEach(() => {
  mockLiveQueryResult = { data: [] };
  jest.clearAllMocks();
});

describe('useRoutines', () => {
  it('data が未解決でも routines は空配列で返す', () => {
    mockLiveQueryResult = { data: undefined };

    expect(mount().routines).toEqual([]);
  });

  it('取得したルーティンをそのまま返す', () => {
    mockLiveQueryResult = { data: [routine] };

    expect(mount().routines).toEqual([routine]);
  });

  it('作成はリマインダー計画つきでそのまま委譲する', async () => {
    const input = { name: '胸の日', exercises: [] } as never;
    const plan = { kind: 'weekly' } as never;

    await mount().createRoutine(input, plan);

    expect(mockRoutinesDb.createRoutine).toHaveBeenCalledWith(input, plan);
  });

  it('リマインダー計画を省略した作成もそのまま通す', async () => {
    const input = { name: '背中の日', exercises: [] } as never;

    await mount().createRoutine(input);

    expect(mockRoutinesDb.createRoutine).toHaveBeenCalledWith(input, undefined);
  });

  it('更新は id・入力・リマインダー計画の順で委譲する', async () => {
    const input = { name: '脚の日', exercises: [] } as never;
    const plan = { kind: 'monthly' } as never;

    await mount().updateRoutine(3, input, plan);

    expect(mockRoutinesDb.updateRoutine).toHaveBeenCalledWith(3, input, plan);
  });

  it('削除・並び替え・複製をそれぞれ対応する関数へ委譲する', async () => {
    const api = mount();

    await api.removeRoutine(3);
    await api.swapOrder(3, 4);
    await api.duplicateRoutine(3);

    expect(mockRoutinesDb.deleteRoutine).toHaveBeenCalledWith(3);
    expect(mockRoutinesDb.swapRoutineOrder).toHaveBeenCalledWith(3, 4);
    expect(mockRoutinesDb.duplicateRoutine).toHaveBeenCalledWith(3);
  });
});
