const mockUseExercises = jest.fn();
const mockGetExerciseHistoryEntries = jest.fn();
const mockComputePersonalBestIds = jest.fn();

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/lib/workout/history', () => ({
  getExerciseHistoryEntries: (...args: unknown[]) => mockGetExerciseHistoryEntries(...args),
  computePersonalBestIds: (...args: unknown[]) => mockComputePersonalBestIds(...args),
  NO_SESSION_TO_EXCLUDE: -1,
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  useScheduledExercisePreviewCards,
  type ScheduledExercisePreviewCard,
} from '@/hooks/use-scheduled-exercise-preview-cards';

function renderHook(exerciseIds: number[]) {
  let result: ScheduledExercisePreviewCard[] | 'error' | null = null;
  function Probe() {
    result = useScheduledExercisePreviewCards(exerciseIds).cards;
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

const benchPress = {
  id: 10,
  name: 'ベンチプレス',
  category: 'chest',
  source: 'preset',
  slug: 'bench_press',
  measurementType: 'weight_reps',
};

beforeEach(() => {
  mockUseExercises.mockReset();
  mockGetExerciseHistoryEntries.mockReset();
  mockComputePersonalBestIds.mockReset();
  mockUseExercises.mockReturnValue({ exercises: [benchPress] });
});

// カレンダーの「直接追加」予定（まだ実施していない予定）の種目一覧カード表示用。過去の実施が
// あれば直近の記録を参考値として、無ければ空のセットとして返す（2026-07-20）
describe('useScheduledExercisePreviewCards', () => {
  it('exerciseIdsが空なら空配列を返し、履歴取得は行わない', async () => {
    const { getResult, root } = renderHook([]);
    await flush(root);
    expect(getResult()).toEqual([]);
    expect(mockGetExerciseHistoryEntries).not.toHaveBeenCalled();
  });

  it('一度も実施したことが無い種目は、種目メタ情報のみでsetsが空のカードを返す', async () => {
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());
    const { getResult, root } = renderHook([10]);
    await flush(root);
    expect(getResult()).toEqual([
      {
        exerciseId: 10,
        name: 'ベンチプレス',
        category: 'chest',
        source: 'preset',
        slug: 'bench_press',
        measurementType: 'weight_reps',
        sets: [],
        isBest: false,
      },
    ]);
  });

  it('実施履歴があれば直近のエントリ（entries[0]、desc(startedAt)済み前提）のsetsを参考値として返す', async () => {
    const latestSets = [{ weight: 80, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: 1 }];
    mockGetExerciseHistoryEntries.mockResolvedValue([
      { workoutSessionExerciseId: 200, sessionId: 2, startedAt: 200, sets: latestSets },
      { workoutSessionExerciseId: 100, sessionId: 1, startedAt: 100, sets: [] },
    ]);
    mockComputePersonalBestIds.mockReturnValue(new Set());
    const { getCards, root } = renderHook([10]);
    await flush(root);
    expect(getCards()[0].sets).toEqual(latestSets);
  });

  it('直近のエントリが自己ベストならisBest:trueを付与する', async () => {
    mockGetExerciseHistoryEntries.mockResolvedValue([
      { workoutSessionExerciseId: 200, sessionId: 2, startedAt: 200, sets: [] },
    ]);
    mockComputePersonalBestIds.mockReturnValue(new Set([200]));
    const { getCards, root } = renderHook([10]);
    await flush(root);
    expect(getCards()[0].isBest).toBe(true);
  });

  it('直近のエントリが自己ベストでなければisBest:falseになる（自己ベストは別の古いエントリ）', async () => {
    mockGetExerciseHistoryEntries.mockResolvedValue([
      { workoutSessionExerciseId: 200, sessionId: 2, startedAt: 200, sets: [] },
      { workoutSessionExerciseId: 100, sessionId: 1, startedAt: 100, sets: [] },
    ]);
    mockComputePersonalBestIds.mockReturnValue(new Set([100]));
    const { getCards, root } = renderHook([10]);
    await flush(root);
    expect(getCards()[0].isBest).toBe(false);
  });

  it('削除済み種目を指すexerciseId（安全網）は結果から除外される', async () => {
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());
    const { getResult, root } = renderHook([999]);
    await flush(root);
    expect(getResult()).toEqual([]);
  });

  it('exerciseIdsの並び順を保持する（history取得が指定順と逆順に解決しても崩れない、回帰防止。@tester指摘）', async () => {
    const squat = {
      id: 11,
      name: 'スクワット',
      category: 'leg',
      source: 'preset',
      slug: 'squat',
      measurementType: 'weight_reps',
    };
    mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
    mockComputePersonalBestIds.mockReturnValue(new Set());

    // exerciseId=10(先頭指定)をわざと後から解決させ、Promise.allの解決順が指定順と
    // 逆になっても最終的な並びはexerciseIdsの指定順(flatMapがexerciseIdsをiterateする)で
    // 決まることを確認する
    let resolveFirst!: (v: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockGetExerciseHistoryEntries.mockImplementation((exerciseId: number) =>
      exerciseId === 10 ? firstPromise : Promise.resolve([]),
    );

    const { getCards, root } = renderHook([10, 11]);
    // 11側を先に解決させてから10側を解決する（指定順とは逆の解決順）
    await act(async () => {
      await Promise.resolve();
    });
    resolveFirst([]);
    await flush(root);

    expect(getCards().map((c) => c.exerciseId)).toEqual([10, 11]);
  });

  it('履歴取得が失敗した場合は\'error\'を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetExerciseHistoryEntries.mockRejectedValue(new Error('fail'));
    const { getResult, root } = renderHook([10]);
    await flush(root);
    expect(getResult()).toBe('error');
  });
});
