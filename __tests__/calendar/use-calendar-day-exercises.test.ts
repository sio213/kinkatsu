const mockGetSessionExerciseCards = jest.fn();
const mockGetExerciseHistoryEntries = jest.fn();
const mockComputePersonalBestIds = jest.fn();

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: jest.fn(),
}));

// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
// eslint-disable-next-line no-var
var capturedFocusEffect: (() => (() => void) | void) | null;

// 実際のuseFocusEffectはナビゲーションのフォーカスイベントに紐づき、マウント時に1回だけ
// 発火する（以後は実際にフォーカスが変わるまで再発火しない）。他画面のテストのように
// 「呼ばれるたびに毎レンダー同期的にeffectを実行する」モック（__tests__/exercises/
// exercises-screen.test.tsx等）を使うと、この画面のeffectはretry()でstate更新を伴うため
// 無限レンダーループになってしまう。実際のuseEffect(dep:[])で代替し、マウント時1回だけ
// 発火する挙動を正しく再現する。effect自体もcapturedFocusEffectに退避し、テストから
// 「マウント後に再度フォーカスされた」を明示的に模擬できるようにする
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => (() => void) | void) => {
      useEffect(() => effect(), []);
      capturedFocusEffect = effect;
    },
  };
});

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
  function Probe({ date }: { date: Date }) {
    const hookResult = useCalendarDayExercises(date);
    result = hookResult.cards;
    retry = hookResult.retry;
    return null;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(React.createElement(Probe, { date: selectedDate }));
  });
  return {
    getResult: () => result,
    getRetry: () => retry!,
    root,
    rerenderWithDate: (date: Date) => {
      act(() => {
        root.update(React.createElement(Probe, { date }));
      });
    },
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

beforeEach(() => {
  mockGetSessionExerciseCards.mockReset();
  mockGetExerciseHistoryEntries.mockReset();
  mockComputePersonalBestIds.mockReset();
  (useWorkoutSessions as jest.Mock).mockReset();
  capturedFocusEffect = null;
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
    const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
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
    mockGetExerciseHistoryEntries.mockResolvedValue([{ workoutSessionExerciseId: 100, sessionId: 1, startedAt: 1, sets: [] }]);
    mockComputePersonalBestIds.mockReturnValue(new Set([100]));

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(mockGetSessionExerciseCards).toHaveBeenCalledWith(1, { includeUnconfirmedCards: true });
    expect(mockGetExerciseHistoryEntries).toHaveBeenCalledWith(1, -1);
    expect(getResult()).toEqual([
      { ...card, sessionId: 1, sessionStartedAt: startedAt, isBest: true, comparison: null },
    ]);
  });

  it('自己ベストでないカードにはisBest:falseを付与する', async () => {
    const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
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

    expect(getResult()).toEqual([
      { ...card, sessionId: 1, sessionStartedAt: startedAt, isBest: false, comparison: null },
    ]);
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

  // 過去記録編集画面(app/workout/[id].tsx)で種目・セットを編集して「戻る」で復帰した際に
  // 変更がすぐ反映されない、というバグの修正（@ユーザー指摘、2026-07-21）。daySessionIdsKeyは
  // 編集では変化しないため、この画面への再フォーカス自体をトリガーに明示的な再取得が必要
  it('マウント後に画面へ再度フォーカスすると、同じ日付を選択したままでも自動的に再取得する', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    mockGetSessionExerciseCards.mockResolvedValue([]);

    const { root } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    expect(mockGetSessionExerciseCards).toHaveBeenCalledTimes(1);

    act(() => {
      capturedFocusEffect?.();
    });
    await flush(root);

    expect(mockGetSessionExerciseCards).toHaveBeenCalledTimes(2);
  });

  // タブ復帰のたびに一瞬スピナー(cards:null)へ差し替わってからカードが出直す、という
  // チラつきの回帰テスト（@reviewer Major指摘、2026-07-21修正）。同じ日付のまま裏で
  // 再取得する場合は、取得が完了するまで直前の表示内容を保持し続けるべき
  it('画面再フォーカスでの再取得中も、完了するまでは直前の表示内容を保持し、nullには戻らない', async () => {
    const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
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
    mockGetSessionExerciseCards.mockResolvedValueOnce([card]);
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    const firstResult = getResult();
    expect(firstResult).not.toBeNull();
    expect(firstResult).not.toBe('error');

    // 2回目の取得はまだ解決しない状態にしておき、取得中の表示内容を確認する
    mockGetSessionExerciseCards.mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      capturedFocusEffect?.();
    });

    // 取得完了前の時点でも、nullやerrorに戻らず直前の結果を保持したままであるべき
    expect(getResult()).toEqual(firstResult);
  });

  it('初回マウント時のフォーカスでは二重取得しない', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    mockGetSessionExerciseCards.mockResolvedValue([]);

    const { root } = renderHook(new Date(2026, 6, 16));
    await flush(root);

    expect(mockGetSessionExerciseCards).toHaveBeenCalledTimes(1);
  });

  it('選択日を変えた直後は、日付変更後の新しいdaySessionIdsKeyにより自動でローディング状態(null)を経由する（前日のカードが一瞬でも混入しない）', async () => {
    const day16 = new Date(2026, 6, 16, 7, 0).getTime();
    const day17 = new Date(2026, 6, 17, 7, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: day16, endedAt: day16 + 1000 },
        { id: 2, startedAt: day17, endedAt: day17 + 1000 },
      ],
    });
    mockGetSessionExerciseCards.mockImplementation((sessionId: number) =>
      Promise.resolve(
        sessionId === 1
          ? [{ workoutSessionExerciseId: 100, exerciseId: 1, name: 'A', category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: 'a', sets: [] }]
          : [{ workoutSessionExerciseId: 200, exerciseId: 2, name: 'B', category: 'leg', measurementType: 'weight_reps', source: 'preset', slug: 'b', sets: [] }],
      ),
    );
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());

    const { getResult, root, rerenderWithDate } = renderHook(new Date(2026, 6, 16));
    await flush(root);
    expect((getResult() as CalendarDayCard[]).map((c) => c.workoutSessionExerciseId)).toEqual([100]);

    rerenderWithDate(new Date(2026, 6, 17));
    await flush(root);

    const ids = (getResult() as CalendarDayCard[]).map((c) => c.workoutSessionExerciseId);
    expect(ids).toEqual([200]);
  });

  it('前回の取得が未解決のまま再フォーカスされても、後発の取得結果だけが反映される（先発が遅れて解決しても上書きしない）', async () => {
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [{ id: 1, startedAt: new Date(2026, 6, 16, 7, 0).getTime(), endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
    });
    let resolveFirst!: (v: unknown[]) => void;
    const firstPromise = new Promise<unknown[]>((r) => {
      resolveFirst = r;
    });
    mockGetSessionExerciseCards.mockImplementationOnce(() => firstPromise).mockImplementationOnce(() => Promise.resolve([]));
    mockGetExerciseHistoryEntries.mockResolvedValue([]);
    mockComputePersonalBestIds.mockReturnValue(new Set());

    const { getResult, root } = renderHook(new Date(2026, 6, 16));
    // 初回取得を未解決のまま止める
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      capturedFocusEffect?.();
    });
    await flush(root);
    // 2回目（後発）の取得が先に解決し、結果は空配列になる
    expect(getResult()).toEqual([]);

    await act(async () => {
      resolveFirst([{ workoutSessionExerciseId: 999, exerciseId: 9, name: 'C', category: 'chest', measurementType: 'weight_reps', source: 'preset', slug: 'c', sets: [] }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush(root);

    // 先発（1回目）が遅れて解決しても、cancelledガードにより結果を上書きしない
    expect(getResult()).toEqual([]);
  });

  it('同じ日に複数セッションがあれば両方の種目カードを合算して返す', async () => {
    const morningStart = new Date(2026, 6, 16, 7, 0).getTime();
    const eveningStart = new Date(2026, 6, 16, 20, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: morningStart, endedAt: new Date(2026, 6, 16, 8, 0).getTime() },
        { id: 2, startedAt: eveningStart, endedAt: new Date(2026, 6, 16, 21, 0).getTime() },
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
      { ...cardA, sessionId: 1, sessionStartedAt: morningStart, isBest: false, comparison: null },
      { ...cardB, sessionId: 2, sessionStartedAt: eveningStart, isBest: false, comparison: null },
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
    expect(mockGetSessionExerciseCards).toHaveBeenCalledWith(2, { includeUnconfirmedCards: true });
  });

  it('同じ種目が複数セッションにまたがる場合でも履歴取得は種目ごとに1回だけ呼ばれる', async () => {
    const morningStart = new Date(2026, 6, 16, 7, 0).getTime();
    const eveningStart = new Date(2026, 6, 16, 20, 0).getTime();
    (useWorkoutSessions as jest.Mock).mockReturnValue({
      sessions: [
        { id: 1, startedAt: morningStart, endedAt: new Date(2026, 6, 16, 8, 0).getTime() },
        { id: 2, startedAt: eveningStart, endedAt: new Date(2026, 6, 16, 21, 0).getTime() },
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
      { ...cardMorning, sessionId: 1, sessionStartedAt: morningStart, isBest: false, comparison: null },
      { ...cardEvening, sessionId: 2, sessionStartedAt: eveningStart, isBest: false, comparison: null },
    ]);
  });

  describe('前回比較(comparison)', () => {
    // 前回比較はgetPreviousSets（別クエリ）ではなく、自己ベスト判定と同じ
    // getExerciseHistoryEntries（✓確定セットを持つカードのみ、new順）から導出する。
    // こうすることで自己ベスト判定と前回比較の「確定/未確定」の基準が常に一致する

    it('前回よりセット内容が良くなっていればcomparisonに差分が入る', async () => {
      const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
      (useWorkoutSessions as jest.Mock).mockReturnValue({
        sessions: [{ id: 2, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
      });
      const card = {
        workoutSessionExerciseId: 200,
        exerciseId: 1,
        name: 'ベンチプレス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: 'bench-press',
        sets: [{ weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
      };
      mockGetSessionExerciseCards.mockResolvedValue([card]);
      // 過去(セッションid=1)の確定セットを含む1件が履歴として返る
      mockGetExerciseHistoryEntries.mockResolvedValue([
        {
          workoutSessionExerciseId: 100,
          sessionId: 1,
          startedAt: 0,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ]);
      mockComputePersonalBestIds.mockReturnValue(new Set());

      const { getResult, root } = renderHook(new Date(2026, 6, 16));
      await flush(root);

      expect(getResult()).toEqual([
        {
          ...card,
          sessionId: 2,
          sessionStartedAt: startedAt,
          isBest: false,
          comparison: { field: 'weight', delta: 2.5, label: '+2.5kg' },
        },
      ]);
    });

    it('前回記録が無ければcomparisonはnullのまま', async () => {
      const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
      (useWorkoutSessions as jest.Mock).mockReturnValue({
        sessions: [{ id: 1, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
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
      mockGetExerciseHistoryEntries.mockResolvedValue([]);
      mockComputePersonalBestIds.mockReturnValue(new Set());

      const { getResult, root } = renderHook(new Date(2026, 6, 16));
      await flush(root);

      expect(getResult()).toEqual([
        { ...card, sessionId: 1, sessionStartedAt: startedAt, isBest: false, comparison: null },
      ]);
    });

    it('履歴に自分自身のセッションしか無ければ前回記録なし扱い（自分自身とは比較しない）', async () => {
      const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
      (useWorkoutSessions as jest.Mock).mockReturnValue({
        sessions: [{ id: 1, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
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
      // 履歴に含まれる唯一のエントリが今表示中のカード自身（同じsessionId）
      mockGetExerciseHistoryEntries.mockResolvedValue([
        { workoutSessionExerciseId: 100, sessionId: 1, startedAt: 1, sets: card.sets },
      ]);
      mockComputePersonalBestIds.mockReturnValue(new Set());

      const { getResult, root } = renderHook(new Date(2026, 6, 16));
      await flush(root);

      expect(getResult()).toEqual([
        { ...card, sessionId: 1, sessionStartedAt: startedAt, isBest: false, comparison: null },
      ]);
    });

    it('✓未確定のセットは比較対象の集計から除外される（自己ベスト判定・表示概要と基準を揃える）', async () => {
      const startedAt = new Date(2026, 6, 16, 7, 0).getTime();
      (useWorkoutSessions as jest.Mock).mockReturnValue({
        sessions: [{ id: 2, startedAt, endedAt: new Date(2026, 6, 16, 8, 0).getTime() }],
      });
      const card = {
        workoutSessionExerciseId: 200,
        exerciseId: 1,
        name: 'ベンチプレス',
        category: 'chest',
        measurementType: 'weight_reps',
        source: 'preset',
        slug: 'bench-press',
        sets: [
          { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 },
          // プリフィルされただけの未確定セット。代表セット選定から除外されるべき
          { weight: 100, reps: 20, durationSeconds: null, distanceMeters: null, completedAt: null },
        ],
      };
      mockGetSessionExerciseCards.mockResolvedValue([card]);
      mockGetExerciseHistoryEntries.mockResolvedValue([
        {
          workoutSessionExerciseId: 100,
          sessionId: 1,
          startedAt: 0,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ]);
      mockComputePersonalBestIds.mockReturnValue(new Set());

      const { getResult, root } = renderHook(new Date(2026, 6, 16));
      await flush(root);

      // 未確定の100kg×20が代表セットに混入していれば+40kgになってしまうが、
      // 確定セット(60kg×8)だけを見るため差分は無し(comparison: null)になるはず
      expect(getResult()).toEqual([
        { ...card, sessionId: 2, sessionStartedAt: startedAt, isBest: false, comparison: null },
      ]);
    });

    it('同日に複数セッションがある場合、朝カードの前回比較は時系列的に後の同日夜セッションと比較されない（PR8で発覚したバグの回帰テスト）', async () => {
      const morningStart = new Date(2026, 6, 16, 7, 0).getTime();
      const eveningStart = new Date(2026, 6, 16, 20, 0).getTime();
      (useWorkoutSessions as jest.Mock).mockReturnValue({
        sessions: [
          { id: 1, startedAt: morningStart, endedAt: new Date(2026, 6, 16, 8, 0).getTime() },
          { id: 2, startedAt: eveningStart, endedAt: new Date(2026, 6, 16, 21, 0).getTime() },
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
        sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
      };
      const cardEvening = {
        ...cardMorning,
        workoutSessionExerciseId: 101,
        sets: [{ weight: 65, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
      };
      mockGetSessionExerciseCards.mockImplementation((sessionId: number) =>
        Promise.resolve(sessionId === 1 ? [cardMorning] : [cardEvening]),
      );
      // getExerciseHistoryEntriesは新しい順（desc(startedAt)）で返る。当日の夜→朝の順に並ぶ
      mockGetExerciseHistoryEntries.mockResolvedValue([
        { workoutSessionExerciseId: 101, sessionId: 2, startedAt: eveningStart, sets: cardEvening.sets },
        { workoutSessionExerciseId: 100, sessionId: 1, startedAt: morningStart, sets: cardMorning.sets },
      ]);
      mockComputePersonalBestIds.mockReturnValue(new Set());

      const { getResult, root } = renderHook(new Date(2026, 6, 16));
      await flush(root);

      const results = getResult() as { sessionId: number; comparison: unknown }[];
      const morningResult = results.find((c) => c.sessionId === 1)!;
      const eveningResult = results.find((c) => c.sessionId === 2)!;

      // 夜カードは正しく「朝(自分より前)」と比較され差分が出る
      expect(eveningResult.comparison).toEqual({ field: 'weight', delta: 5, label: '+5kg' });
      // 朝カードは、自分より後に始まった同日夜セッションと比較されてはいけない
      // （前回記録が無い扱い＝comparison:nullになるべき）
      expect(morningResult.comparison).toBeNull();
    });
  });
});
