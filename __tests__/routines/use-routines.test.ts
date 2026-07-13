// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockLiveQueryQueue: { data: unknown }[];

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
  routines: { id: 'id', orderIndex: 'orderIndex' },
  routineExercises: { routineId: 'routineId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  exercises: { id: 'id', category: 'category' },
  reminders: { routineId: 'routineId' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryQueue.shift() ?? { data: undefined }),
}));

import { useRoutineExerciseSummaries, useRoutineReminders } from '@/hooks/use-routines';
import type { Reminder } from '@/db/schema';
import React from 'react';
import { act, create } from 'react-test-renderer';

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

describe('useRoutineExerciseSummaries', () => {
  const mount = makeHarness(useRoutineExerciseSummaries);

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

  it('同じルーティン内で同カテゴリの種目が複数あっても、exerciseCountは行数分・categoriesは重複除去される', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { routineId: 1, category: 'chest' },
          { routineId: 1, category: 'shoulder' },
          { routineId: 1, category: 'chest' },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({ exerciseCount: 3, categories: ['chest', 'shoulder'] });
  });

  it('複数のルーティンが混在するJOIN結果でも、routineIdごとに正しく分離される', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { routineId: 1, category: 'chest' },
          { routineId: 2, category: 'leg' },
          { routineId: 1, category: 'arm' },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({ exerciseCount: 2, categories: ['chest', 'arm'] });
    expect(result.get(2)).toEqual({ exerciseCount: 1, categories: ['leg'] });
  });

  it('liveQueryのdataの参照が変わらなければ、再レンダーしても同じMap参照を返す', () => {
    const rows = [{ routineId: 1, category: 'chest' }];
    const captured: Map<number, unknown>[] = [];
    let triggerRerender!: () => void;

    function Harness() {
      const [, forceUpdate] = React.useReducer((c: number) => c + 1, 0);
      triggerRerender = () => forceUpdate();
      captured.push(useRoutineExerciseSummaries());
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

describe('useRoutineReminders', () => {
  const mount = makeHarness(useRoutineReminders);

  const baseReminder: Reminder = {
    id: 1,
    routineId: 10,
    title: 't',
    body: 'b',
    kind: 'interval',
    hour: 7,
    minute: 0,
    weekdays: null,
    monthdays: null,
    anchorDate: null,
    intervalDays: 1,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  it('dataがundefined/空配列のとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    expect(mount().size).toBe(0);
  });

  it('routineIdごとにリマインダーを引けるMapを作る', () => {
    mockLiveQueryQueue = [{ data: [baseReminder, { ...baseReminder, id: 2, routineId: 20 }] }];
    const result = mount();
    expect(result.get(10)?.id).toBe(1);
    expect(result.get(20)?.id).toBe(2);
  });

  it('routineIdがnullの行が紛れ込んでも例外を投げず除外される（isNotNullクエリの取りこぼしに対する防御）', () => {
    mockLiveQueryQueue = [{ data: [{ ...baseReminder, routineId: null }] }];
    const result = mount();
    expect(result.size).toBe(0);
  });

  it('同じroutineIdのリマインダーが複数あった場合、後の行で上書きされる（1対1想定外データの挙動を明示）', () => {
    mockLiveQueryQueue = [
      { data: [{ ...baseReminder, id: 1 }, { ...baseReminder, id: 2 }] },
    ];
    const result = mount();
    expect(result.get(10)?.id).toBe(2);
  });
});
