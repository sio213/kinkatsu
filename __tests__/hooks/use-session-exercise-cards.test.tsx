const mockGetSessionExerciseCards = jest.fn();
const mockGetExerciseHistoryEntries = jest.fn();
const mockComputePersonalBestIds = jest.fn();

// 実際のuseFocusEffectはナビゲーションのフォーカスイベントに紐づき、マウント時に1回だけ発火する。
// 毎レンダー同期実行するモックにするとretry()のstate更新で無限ループになるため、useEffect(dep:[])
// で代替する（__tests__/calendar/use-calendar-day-exercises.test.ts と同じ理由）
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => (() => void) | void) => {
      useEffect(() => effect(), []);
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
import {
  useSessionExerciseCards,
  type RecordedExerciseCard,
} from '@/hooks/use-session-exercise-cards';

type Sessions = { id: number; startedAt: number }[];

/** レンダーのたびにcardsを記録する。1フレームだけ現れる中間状態を検証するため */
function renderHook(initial: Sessions) {
  const seen: (RecordedExerciseCard[] | 'error' | null)[] = [];
  function Probe({ sessions }: { sessions: Sessions }) {
    const { cards } = useSessionExerciseCards(sessions);
    seen.push(cards);
    return null;
  }
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(Probe, { sessions: initial }));
  });
  return {
    seen,
    rerender: (sessions: Sessions) => {
      act(() => {
        instance.update(React.createElement(Probe, { sessions }));
      });
    },
  };
}

function card(workoutSessionExerciseId: number) {
  return {
    workoutSessionExerciseId,
    exerciseId: workoutSessionExerciseId,
    name: `種目${workoutSessionExerciseId}`,
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: null,
    sets: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetExerciseHistoryEntries.mockResolvedValue([]);
  mockComputePersonalBestIds.mockReturnValue([]);
});

test('対象セッションが無いときは読み込み中を経由せず空配列で確定する', () => {
  const { seen } = renderHook([]);

  expect(seen.at(-1)).toEqual([]);
});

// 完了サマリーはセッションの解決前に空配列を渡すため、対象が [] → [1件] に変わる。
// 結果を配列だけで持つと、切り替えた最初のフレームに前の対象の結果（空配列）が残り、
// 「種目 全0件」が一瞬見えてしまう
test('対象が切り替わった直後は、前の対象の結果を描かず読み込み中に倒す', async () => {
  mockGetSessionExerciseCards.mockResolvedValue([card(1)]);
  const { seen, rerender } = renderHook([]);
  expect(seen.at(-1)).toEqual([]);

  rerender([{ id: 1, startedAt: 100 }]);

  // 取得が解決する前のフレーム。空配列のまま描かれてはいけない
  expect(seen.at(-1)).toBeNull();

  await act(async () => {});
  expect(seen.at(-1)).toHaveLength(1);
});

// 画面再フォーカスでの再取得（対象は同じ）では、前回の結果を出したまま裏で差し替える。
// 毎回nullに戻すと、戻ってくるたびに一瞬空になってからカードが出直す
test('同じ対象を取り直す間は前回の結果を表示したままにする', async () => {
  mockGetSessionExerciseCards.mockResolvedValue([card(1)]);
  const { seen, rerender } = renderHook([{ id: 1, startedAt: 100 }]);
  await act(async () => {});
  expect(seen.at(-1)).toHaveLength(1);

  // 同じidのまま新しい配列参照を渡す（毎レンダー作り直される呼び出し側を模す）
  rerender([{ id: 1, startedAt: 100 }]);

  expect(seen.at(-1)).toHaveLength(1);
});

test('取得に失敗したらerrorを返す', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSessionExerciseCards.mockRejectedValue(new Error('fail'));

  const { seen } = renderHook([{ id: 1, startedAt: 100 }]);
  await act(async () => {});

  expect(seen.at(-1)).toBe('error');
});
