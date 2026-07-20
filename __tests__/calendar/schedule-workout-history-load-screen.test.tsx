const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockAddHistoryCardsToScheduledWorkout = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// session-history-load-screen.test.tsxと同じ理由でdb/client等は最小限モックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({
  exercises: {},
  sets: {},
  workoutSessionExercises: {},
  workoutSessions: {},
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
  ne: jest.fn(),
}));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => ({
  addHistoryCardsToScheduledWorkout: (...args: unknown[]) => mockAddHistoryCardsToScheduledWorkout(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, Alert, Text, TouchableOpacity } from 'react-native';
import ScheduleWorkoutHistoryLoadScreen from '@/app/calendar/schedule-workout-history-load';
import * as historyModule from '@/lib/workout/history';
import type { SessionHistoryCard } from '@/lib/workout/history';

const mockGetSessionExerciseCards = jest.spyOn(historyModule, 'getSessionExerciseCards');

const benchCard: SessionHistoryCard = {
  workoutSessionExerciseId: 500,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
  sets: [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};
const flyCard: SessionHistoryCard = {
  workoutSessionExerciseId: 501,
  exerciseId: 11,
  name: 'ダンベルフライ',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'dumbbell_fly',
  sets: [{ setNumber: 1, weight: 14, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
};

function findSubmitButton(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) =>
      btn.findAllByType(Text).some((t) => typeof t.props.children === 'string' && t.props.children.endsWith('読み込む')),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutHistoryLoadScreen));
  });
  return instance.root;
}

async function renderResolved(cards: SessionHistoryCard[] | Error) {
  if (cards instanceof Error) {
    mockGetSessionExerciseCards.mockRejectedValue(cards);
  } else {
    mockGetSessionExerciseCards.mockResolvedValue(cards);
  }
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    scheduledWorkoutId: '5',
    sourceSessionId: '99',
    sourceStartedAt: String(new Date(2026, 6, 3, 10, 0).getTime()),
  });
  mockAddHistoryCardsToScheduledWorkout.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ヘッダー⋮「過去の記録から読み込む」フローの画面3。app/workout/session-history-load.tsxの
// カレンダー版（2026-07-21新設）
describe('ScheduleWorkoutHistoryLoadScreen', () => {
  test('ヘッダーに選んだ過去セッションの日付を表示する', async () => {
    const root = await renderResolved([benchCard]);
    expect(root.findByProps({ children: 'この記録から読み込み' })).toBeDefined();
    expect(root.findByProps({ children: '7月3日（金）' })).toBeDefined();
  });

  test('取得成功なら全種目が初期状態で選択済みになる', async () => {
    const root = await renderResolved([benchCard, flyCard]);
    expect(root.findByProps({ children: '2 / 2' })).toBeDefined();
    expect(root.findByProps({ children: 'すべて読み込む' })).toBeDefined();
  });

  test('送信するとaddHistoryCardsToScheduledWorkoutに選択した種目を渡し、成功後にdismiss(2)する', async () => {
    const root = await renderResolved([benchCard, flyCard]);
    const submitBtn = findSubmitButton(root)!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddHistoryCardsToScheduledWorkout).toHaveBeenCalledWith(5, [
      { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
      { exerciseId: 11, sourceWorkoutSessionExerciseId: 501 },
    ]);
    expect(mockDismiss).toHaveBeenCalledWith(2);
  });

  test('失敗した場合はエラーAlertを表示し、dismissは呼ばれない', async () => {
    const root = await renderResolved([benchCard]);
    mockAddHistoryCardsToScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
    const submitBtn = findSubmitButton(root)!;
    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を読み込めませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  test('連打してもaddHistoryCardsToScheduledWorkoutは1回しか呼ばれない', async () => {
    const root = await renderResolved([benchCard]);
    let resolveAdd!: () => void;
    mockAddHistoryCardsToScheduledWorkout.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAdd = resolve;
      }),
    );
    const submitBtn = findSubmitButton(root)!;
    act(() => {
      submitBtn.props.onPress();
      submitBtn.props.onPress();
    });
    expect(mockAddHistoryCardsToScheduledWorkout).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAdd();
    });
  });

  test('取得失敗時はエラーメッセージと再試行ボタンを表示する', async () => {
    const root = await renderResolved(new Error('fail'));
    expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();
  });

  test('取得中はActivityIndicatorを表示し、ヘッダー・フッターは非表示', () => {
    mockGetSessionExerciseCards.mockReturnValue(new Promise(() => {}));
    const root = render();
    expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(() => root.findByProps({ children: 'すべて読み込む' })).toThrow();
  });

  test('この日の記録が0件なら空状態のメッセージを表示し、戻るボタンでrouter.backする', async () => {
    const root = await renderResolved([]);
    expect(root.findByProps({ children: 'この日の記録がまだありません' })).toBeDefined();

    const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
    act(() => {
      backBtn.props.onPress();
    });
    expect(mockBack).toHaveBeenCalled();
  });

  test('scheduledWorkoutId/sourceSessionIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: 'abc', sourceSessionId: '99', sourceStartedAt: '0' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
    expect(mockGetSessionExerciseCards).not.toHaveBeenCalled();
  });
});
