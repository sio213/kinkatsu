const mockUseScheduledWorkoutExercises = jest.fn();
const mockGetExerciseHistoryEntries = jest.fn();

jest.mock('@/hooks/use-scheduled-workout-exercises', () => ({
  useScheduledWorkoutExercises: (...args: unknown[]) => mockUseScheduledWorkoutExercises(...args),
}));

jest.mock('@/lib/workout/history', () => ({
  getExerciseHistoryEntries: (...args: unknown[]) => mockGetExerciseHistoryEntries(...args),
  NO_SESSION_TO_EXCLUDE: -1,
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useScheduledExerciseCards, type ScheduledExerciseCard } from '@/hooks/use-scheduled-exercise-cards';

function renderHook(scheduledWorkoutId: number) {
  let result: ScheduledExerciseCard[] | 'error' | null = null;
  function Probe() {
    result = useScheduledExerciseCards(scheduledWorkoutId).cards;
    return null;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(React.createElement(Probe));
  });
  return {
    getResult: () => result,
    getCards: () => (Array.isArray(result) ? result : []),
    root,
  };
}

async function flush(root: ReturnType<typeof create>) {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

const benchExercise = {
  scheduledWorkoutExerciseId: 100,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
};

beforeEach(() => {
  mockUseScheduledWorkoutExercises.mockReset();
  mockGetExerciseHistoryEntries.mockReset();
});

// カレンダーの「直接追加」予定（まだ実施していない予定）の種目一覧カード表示用。目標セット
// (scheduledWorkoutSets)を優先し、未設定の種目だけ直近の実施記録を参考値にする（2026-07-21、
// @ユーザー指摘: 目標セットを編集して戻ってもカードに反映されない問題の修正）
describe('useScheduledExerciseCards', () => {
  it('目標セットに値があれば、履歴取得を行わずそのまま表示する', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      {
        ...benchExercise,
        sets: [{ id: 1, weight: 70, reps: 6, durationSeconds: null, distanceMeters: null }],
      },
    ]);
    const { getCards, root } = renderHook(5);
    await flush(root);
    expect(mockGetExerciseHistoryEntries).not.toHaveBeenCalled();
    expect(getCards()).toEqual([
      {
        exerciseId: 10,
        name: 'ベンチプレス',
        category: 'chest',
        source: 'preset',
        slug: 'bench_press',
        measurementType: 'weight_reps',
        sets: [{ weight: 70, reps: 6, durationSeconds: null, distanceMeters: null, completedAt: 0 }],
      },
    ]);
  });

  it('目標セットが空(全カラムnull)の種目は、直近の実施記録を参考値として取得する', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      {
        ...benchExercise,
        sets: [{ id: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null }],
      },
    ]);
    const latestSets = [{ weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }];
    mockGetExerciseHistoryEntries.mockResolvedValue([
      { workoutSessionExerciseId: 200, sessionId: 2, startedAt: 200, sets: latestSets },
    ]);
    const { getCards, root } = renderHook(5);
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(10, -1);
    expect(getCards()[0].sets).toEqual(latestSets);
  });

  it('目標セットが1件も無い種目（セット削除済み等）も履歴フォールバックの対象になる', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([{ ...benchExercise, sets: [] }]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    const { getCards, root } = renderHook(5);
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(10, -1);
    expect(getCards()[0].sets).toEqual([]);
  });

  it('種目が0件なら履歴取得を行わず空配列を返す', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([]);
    const { getResult, root } = renderHook(5);
    await flush(root);
    expect(getResult()).toEqual([]);
    expect(mockGetExerciseHistoryEntries).not.toHaveBeenCalled();
  });

  it('複数種目が混在する場合、種目ごとに個別判定する（一部だけ目標セット設定済み、他は履歴フォールバック）', async () => {
    const squatExercise = {
      scheduledWorkoutExerciseId: 101,
      exerciseId: 11,
      name: 'スクワット',
      category: 'leg',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'squat',
    };
    mockUseScheduledWorkoutExercises.mockReturnValue([
      { ...benchExercise, sets: [{ id: 1, weight: 70, reps: 6, durationSeconds: null, distanceMeters: null }] },
      { ...squatExercise, sets: [{ id: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
    ]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    const { getCards, root } = renderHook(5);
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledTimes(1);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(11, -1);
    expect(getCards().find((c) => c.exerciseId === 10)?.sets).toEqual([
      { weight: 70, reps: 6, durationSeconds: null, distanceMeters: null, completedAt: 0 },
    ]);
    expect(getCards().find((c) => c.exerciseId === 11)?.sets).toEqual([]);
  });

  it('履歴取得が失敗した場合は\'error\'を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUseScheduledWorkoutExercises.mockReturnValue([
      { ...benchExercise, sets: [{ id: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
    ]);
    mockGetExerciseHistoryEntries.mockRejectedValue(new Error('fail'));
    const { getResult, root } = renderHook(5);
    await flush(root);
    expect(getResult()).toBe('error');
  });

  it('retryを呼ぶと履歴を再取得する', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      { ...benchExercise, sets: [{ id: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
    ]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    let retryFn!: () => void;
    function Probe() {
      const { retry } = useScheduledExerciseCards(5);
      retryFn = retry;
      return null;
    }
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(React.createElement(Probe));
    });
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledTimes(1);

    act(() => {
      retryFn();
    });
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledTimes(2);
  });
});
