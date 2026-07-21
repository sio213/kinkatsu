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

// completedAtはCalendarExerciseCard内部の「確定セットのみ表示」ガード(!= null)を通すためだけの
// センチネル値で、値自体に意味は無い契約のため、具体的な数値ではなく非nullであることだけを見る
function expectTargetSets(sets: ScheduledExerciseCard['sets'], expected: Omit<ScheduledExerciseCard['sets'][number], 'completedAt'>[]) {
  expect(sets).toHaveLength(expected.length);
  sets.forEach((s, i) => {
    expect(s).toMatchObject(expected[i]);
    expect(s.completedAt).not.toBeNull();
  });
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
    const cards = getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      scheduledWorkoutExerciseId: 100,
      exerciseId: 10,
      name: 'ベンチプレス',
      category: 'chest',
      source: 'preset',
      slug: 'bench_press',
      measurementType: 'weight_reps',
    });
    expectTargetSets(cards[0].sets, [{ weight: 70, reps: 6, durationSeconds: null, distanceMeters: null }]);
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

  it('同じ種目が複数回この予定に含まれていても、履歴取得はexerciseId単位で1回にまとめる（@reviewer指摘: 重複時の冗長なDBアクセス防止）', async () => {
    mockUseScheduledWorkoutExercises.mockReturnValue([
      { ...benchExercise, scheduledWorkoutExerciseId: 100, sets: [] },
      { ...benchExercise, scheduledWorkoutExerciseId: 101, sets: [] },
    ]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    const { getCards, root } = renderHook(5);
    await flush(root);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledTimes(1);
    const cards = getCards();
    expect(cards.map((c) => c.scheduledWorkoutExerciseId)).toEqual([100, 101]);
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
    expectTargetSets(getCards().find((c) => c.exerciseId === 10)!.sets, [
      { weight: 70, reps: 6, durationSeconds: null, distanceMeters: null },
    ]);
    expect(getCards().find((c) => c.exerciseId === 11)?.sets).toEqual([]);
  });

  it('一部の種目だけ履歴取得が失敗しても、その種目だけ空セットになり他の種目（目標セット・履歴取得成功分）は表示され続ける（cards全体をerrorにしない）', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const squatExercise = {
      scheduledWorkoutExerciseId: 101,
      exerciseId: 11,
      name: 'スクワット',
      category: 'leg',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'squat',
    };
    const deadliftExercise = {
      scheduledWorkoutExerciseId: 102,
      exerciseId: 12,
      name: 'デッドリフト',
      category: 'back',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'deadlift',
    };
    mockUseScheduledWorkoutExercises.mockReturnValue([
      // 目標セット設定済み（履歴取得不要）
      { ...benchExercise, sets: [{ id: 1, weight: 70, reps: 6, durationSeconds: null, distanceMeters: null }] },
      // 履歴取得が失敗する
      { ...squatExercise, sets: [{ id: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
      // 履歴取得が成功する
      { ...deadliftExercise, sets: [{ id: 3, weight: null, reps: null, durationSeconds: null, distanceMeters: null }] },
    ]);
    mockGetExerciseHistoryEntries.mockImplementation((exerciseId: number) =>
      exerciseId === 11 ? Promise.reject(new Error('fail')) : Promise.resolve([]),
    );
    const { getCards, getResult, root } = renderHook(5);
    await flush(root);

    expect(getResult()).not.toBe('error');
    expectTargetSets(getCards().find((c) => c.exerciseId === 10)!.sets, [
      { weight: 70, reps: 6, durationSeconds: null, distanceMeters: null },
    ]);
    expect(getCards().find((c) => c.exerciseId === 11)?.sets).toEqual([]);
    expect(getCards().find((c) => c.exerciseId === 12)?.sets).toEqual([]);
  });

  it('必要な履歴取得が全て失敗した場合はcards全体を\'error\'にする（部分失敗とは区別し、retryを意味のあるものにする）', async () => {
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
