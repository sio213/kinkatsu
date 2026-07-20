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
  scheduledWorkoutExercises: { scheduledWorkoutId: 'scheduledWorkoutId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  exercises: { id: 'id', category: 'category', name: 'name' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryQueue.shift() ?? { data: undefined }),
}));

import { useCalendarDirectScheduleSummaries } from '@/hooks/use-calendar-direct-schedule-summaries';
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

describe('useCalendarDirectScheduleSummaries', () => {
  const mount = makeHarness(useCalendarDirectScheduleSummaries);

  it('dataがundefinedのとき空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: undefined }];
    expect(mount().size).toBe(0);
  });

  it('dataが空配列のときも空のMapを返す', () => {
    mockLiveQueryQueue = [{ data: [] }];
    expect(mount().size).toBe(0);
  });

  it('同じ予定内で同カテゴリの種目が複数あっても、exerciseCountは行数分・categoriesは重複除去される', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { scheduledWorkoutId: 1, exerciseId: 10, category: 'chest', name: 'ベンチプレス' },
          { scheduledWorkoutId: 1, exerciseId: 11, category: 'shoulder', name: 'ショルダープレス' },
          { scheduledWorkoutId: 1, exerciseId: 12, category: 'chest', name: 'インクラインベンチプレス' },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({
      exerciseCount: 3,
      categories: ['chest', 'shoulder'],
      exerciseNames: ['ベンチプレス', 'ショルダープレス', 'インクラインベンチプレス'],
      exerciseIds: [10, 11, 12],
    });
  });

  it('複数の直接予定が混在するJOIN結果でも、scheduledWorkoutIdごとに正しく分離される', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { scheduledWorkoutId: 1, exerciseId: 10, category: 'chest', name: 'ベンチプレス' },
          { scheduledWorkoutId: 2, exerciseId: 20, category: 'leg', name: 'スクワット' },
          { scheduledWorkoutId: 1, exerciseId: 13, category: 'arm', name: 'アームカール' },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)).toEqual({
      exerciseCount: 2,
      categories: ['chest', 'arm'],
      exerciseNames: ['ベンチプレス', 'アームカール'],
      exerciseIds: [10, 13],
    });
    expect(result.get(2)).toEqual({
      exerciseCount: 1,
      categories: ['leg'],
      exerciseNames: ['スクワット'],
      exerciseIds: [20],
    });
  });

  it('exerciseNames/exerciseIdsはorderIndex順（クエリのorderBy結果の並び）をそのまま保つ', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { scheduledWorkoutId: 1, exerciseId: 10, category: 'chest', name: 'ベンチプレス' },
          { scheduledWorkoutId: 1, exerciseId: 30, category: 'back', name: 'デッドリフト' },
          { scheduledWorkoutId: 1, exerciseId: 20, category: 'leg', name: 'スクワット' },
        ],
      },
    ];
    const result = mount();
    expect(result.get(1)?.exerciseNames).toEqual(['ベンチプレス', 'デッドリフト', 'スクワット']);
    expect(result.get(1)?.exerciseIds).toEqual([10, 30, 20]);
  });
});
