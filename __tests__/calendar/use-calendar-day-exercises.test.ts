const mockGetSessionExerciseCards = jest.fn();
const mockGetExerciseHistoryEntries = jest.fn();
const mockComputePersonalBestIds = jest.fn();

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: jest.fn(),
}));

jest.mock('@/lib/workout/history', () => ({
  getSessionExerciseCards: (...args: unknown[]) => mockGetSessionExerciseCards(...args),
  getExerciseHistoryEntries: (...args: unknown[]) => mockGetExerciseHistoryEntries(...args),
  computePersonalBestIds: (...args: unknown[]) => mockComputePersonalBestIds(...args),
  NO_SESSION_TO_EXCLUDE: -1,
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useWorkoutSessions } from '@/hooks/use-workout-session';
import { useCalendarDayExercises, type CalendarDayCard } from '@/hooks/use-calendar-day-exercises';

function renderHook(selectedDate: Date) {
  let result: CalendarDayCard[] | 'error' | null = null;
  let retry: (() => void) | null = null;
  function Probe() {
    const hookResult = useCalendarDayExercises(selectedDate);
    result = hookResult.cards;
    retry = hookResult.retry;
    return null;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(React.createElement(Probe));
  });
  return { getResult: () => result, getRetry: () => retry!, root };
}

async function flush(root: ReturnType<typeof create>) {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  mockGetSessionExerciseCards.mockReset();
  mockGetExerciseHistoryEntries.mockReset();
  mockComputePersonalBestIds.mockReset();
  (useWorkoutSessions as jest.Mock).mockReset();
});

describe('useCalendarDayExercises', () => {
  it('選択日と一致する完了済みセッションが無ければ空配列を返す', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 17).getTime(), endedAt: new Date(2026, 6, 17).getTime() }],
    });
    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    expect(getResult()).toEqual([]);
    expect(mockGetSessionExerciseCards).not.toHaveBeenCalled();
  });

  it('進行中セッション(endedAt null)は対象外にする', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16).getTime(), endedAt: null }],
    });
    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    expect(getResult()).toEqual([]);
  });

  it('選択日のセッションの種目カードを取得し、自己ベストのカードにisBest:trueを付与する', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    const card = {
      workoutSessionExerciseId: 100,
      exerciseId: 1,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench-press',
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
    };
    mockGetSessionExerciseCards.mockResolvedValue([card]);
    mockGetExerciseHistoryEntries.mockResolvedValue([{ workoutSessionExerciseId: 100, startedAt: 1, sets: [] }]);
    mockComputePersonalBestIds.mockReturnValue(new Set([100]));

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(mockGetSessionExerciseCards).toHaveBeenCalledWith(1);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(1, -1);
    expect(getResult()).toEqual([{ ...card, isBest: true }]);
  });

  it('自己ベストでないカードにはisBest:falseを付与する', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    const card = {
      workoutSessionExerciseId: 100,
      exerciseId: 1,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench-press',
      sets: [],
    };
    mockGetSessionExerciseCards.mockResolvedValue([card]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set()); // 別のカードidが自己ベスト

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(getResult()).toEqual([{ ...card, isBest: false }]);
  });

  it('取得に失敗したら\'error\'を返す', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    mockGetSessionExerciseCards.mockRejectedValue(new Error('boom'));

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(getResult()).toBe('error');
  });

  it('retry()を呼ぶと、同じ日付を選択したままでも再取得する', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    mockGetSessionExerciseCards.mockRejectedValueOnce(new Error('boom'));
    mockGetSessionExerciseCards.mockResolvedValueOnce([]);

    const { getResult, getRetry, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    expect(getResult()).toBe('error');

    act(() => getRetry()());
    await flush(root);

    expect(getResult()).toEqual([]);
    expect(mockGetSessionExerciseCards).toHaveBeenCalledTimes(2);
  });

  it('同じ日に複数セッションがあれば両方の種目カードを合算して返す', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() },
        { id: 2, startedAt: new Date(2026, 6, 16, 20, 0).getTime(), endedAt: new Date(2026, 6, 16, 21, 0).getTime() },
      ],
    });
    const cardA = {
      workoutSessionExerciseId: 100,
      exerciseId: 1,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench-press',
      sets: [],
    };
    const cardB = {
      workoutSessionExerciseId: 200,
      exerciseId: 2,
      name: 'スクワット',
      category: 'leg',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'squat',
      sets: [],
    };
    mockGetSessionExerciseCards.mockImplementation((sessionId: number) =>
      Promise.resolve(sessionId === 1 ? [cardA] : [cardB]),
    );
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(getResult()).toEqual([
      { ...cardA, isBest: false },
      { ...cardB, isBest: false },
    ]);
  });

  it('複数セッションのうち選択日と一致するものだけを対象にする（前日・当日・翌日が混在）', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: new Date(2026, 6, 15, 20, 0).getTime(), endedAt: new Date(2026, 6, 15, 21, 0).getTime() }, // 前日
        { id: 2, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }, // 当日
        { id: 3, startedAt: new Date(2026, 6, 17, 7, 0).getTime(), endedAt: new Date(2026, 6, 17, 8, 0).getTime() }, // 翌日
      ],
    });
    mockGetSessionExerciseCards.mockResolvedValue([]);

    const { root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(mockGetSessionExerciseCards).toHaveBeenCalledTimes(1);
    expect(mockGetSessionExerciseCards).toHaveBeenCalledWith(2);
  });

  it('同じ種目が複数セッションにまたがる場合でも履歴取得は種目ごとに1回だけ呼ばれる', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() },
        { id: 2, startedAt: new Date(2026, 6, 16, 20, 0).getTime(), endedAt: new Date(2026, 6, 16, 21, 0).getTime() },
      ],
    });
    const cardMorning = {
      workoutSessionExerciseId: 100,
      exerciseId: 1,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench-press',
      sets: [],
    };
    const cardEvening = { ...cardMorning, workoutSessionExerciseId: 101 };
    mockGetSessionExerciseCards.mockImplementation((sessionId: number) =>
      Promise.resolve(sessionId === 1 ? [cardMorning] : [cardEvening]),
    );
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledTimes(1);
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(1, -1);
    expect(getResult()).toEqual([
      { ...cardMorning, isBest: false },
      { ...cardEvening, isBest: false },
    ]);
  });
});
