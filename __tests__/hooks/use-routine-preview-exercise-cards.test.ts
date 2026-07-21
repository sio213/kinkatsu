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
  routineExercises: { id: 'id', routineId: 'routineId', exerciseId: 'exerciseId', orderIndex: 'orderIndex' },
  routineSets: {
    id: 'id',
    routineExerciseId: 'routineExerciseId',
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

import { useRoutinePreviewExerciseCards } from '@/hooks/use-routine-preview-exercise-cards';
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

describe('useRoutinePreviewExerciseCards', () => {
  const mount = makeHarness(() => useRoutinePreviewExerciseCards(10));

  it('exerciseRows/setRowsどちらもundefinedのとき、loaded:falseで空配列を返す', () => {
    mockLiveQueryQueue = [{ data: undefined }, { data: undefined }];
    expect(mount()).toEqual({ exercises: [], loaded: false });
  });

  it('exerciseRows/setRowsの一方だけ解決済みのとき、まだloaded:falseのまま（use-scheduled-workout-exercisesと同じ理由: 両方揃うまでは「読み込み中」として扱う必要がある）', () => {
    mockLiveQueryQueue = [{ data: [] }, { data: undefined }];
    expect(mount()).toEqual({ exercises: [], loaded: false });
  });

  it('種目一覧をorderIndex順（クエリのorderBy結果の並び）のまま返し、各種目に対応するsetsをまとめる', () => {
    mockLiveQueryQueue = [
      {
        data: [
          { routineExerciseId: 100, exerciseId: 1, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: 'bench_press' },
          { routineExerciseId: 101, exerciseId: 2, name: 'スクワット', category: 'leg', measurementType: 'weight_reps', source: 'preset', slug: 'squat' },
        ],
      },
      {
        data: [
          { routineExerciseId: 100, id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
          { routineExerciseId: 100, id: 901, weight: 65, reps: 6, durationSeconds: null, distanceMeters: null },
        ],
      },
    ];
    const result = mount();
    expect(result).toEqual({
      exercises: [
        {
          routineExerciseId: 100,
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
          routineExerciseId: 101,
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

  // 「読み込み中で空」(loaded:false)とは別の正当な状態。lib/calendar/scheduled-workouts.tsの
  // addScheduledWorkoutが「ルーティンが削除済み、または0種目の場合は空配列にフォールバックする」
  // と明記している通り、0種目ルーティンは実際に起こりうる（@tester指摘）
  it('ルーティンに種目が1件も無い場合、loaded:trueでexercises:[]を返す', () => {
    mockLiveQueryQueue = [{ data: [] }, { data: [] }];
    expect(mount()).toEqual({ exercises: [], loaded: true });
  });
});
