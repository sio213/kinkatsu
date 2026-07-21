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
  scheduledWorkoutExercises: { id: 'id', scheduledWorkoutId: 'scheduledWorkoutId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  scheduledWorkoutSets: {
    id: 'id',
    scheduledWorkoutExerciseId: 'scheduledWorkoutExerciseId',
    setNumber: 'setNumber',
    weight: 'weight',
    reps: 'reps',
    durationSeconds: 'durationSeconds',
    distanceMeters: 'distanceMeters',
  },
  exercises: { id: 'id', name: 'name', category: 'category', measurementType: 'measurementType', source: 'source', slug: 'slug' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryQueue.shift() ?? { data: undefined }),
}));

import { useScheduledWorkoutExercises } from '@/hooks/use-scheduled-workout-exercises';
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

describe('useScheduledWorkoutExercises', () => {
  const mount = makeHarness(() => useScheduledWorkoutExercises(1));

  it('exerciseRows/setRowsどちらもundefinedのとき、loaded:falseで空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }, { data: undefined }];
    expect(mount()).toEqual({ exercises: [], loaded: false });
  });

  it('exerciseRows/setRowsの一方だけ解決済みのとき、まだloaded:falseのまま（@reviewer指摘: 両方揃うまでは「読み込み中」として扱う必要がある）', () => {
    mockLiveQueryQueue = [{ data: [] }, { data: undefined }];
    expect(mount()).toEqual({ exercises: [], loaded: false });
  });

  it('種目一覧をorderIndex順（クエリのorderBy結果の並び）のまま返し、各種目に対応するsetsをまとめる', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { scheduledWorkoutExerciseId: 100, exerciseId: 1, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: 'bench_press' },
          { scheduledWorkoutExerciseId: 101, exerciseId: 2, name: 'スクワット', category: 'leg', measurementType: 'weight_reps', source: 'preset', slug: 'squat' },
        ],
      },
      {
        data: [
          { scheduledWorkoutExerciseId: 100, id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
          { scheduledWorkoutExerciseId: 100, id: 901, weight: 65, reps: 6, durationSeconds: null, distanceMeters: null },
        ],
      },
    ];
    const result = mount();
    expect(result).toEqual({
      exercises: [
        {
          scheduledWorkoutExerciseId: 100,
          exerciseId: 1,
          name: 'ベンチプレス',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench_press',
          sets: [
            { id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
            { id: 901, weight: 65, reps: 6, durationSeconds: null, distanceMeters: null },
          ],
        },
        {
          scheduledWorkoutExerciseId: 101,
          exerciseId: 2,
          name: 'スクワット',
          category: 'leg',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'squat',
          sets: [],
        },
      ],
      loaded: true,
    });
  });
});
