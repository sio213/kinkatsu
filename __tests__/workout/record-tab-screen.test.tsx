const mockPush = jest.fn();
const mockUseWorkoutSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import RecordScreen from '@/app/(tabs)/index';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(RecordScreen));
  });
  return instance.root;
}

function baseSessions(overrides: Partial<ReturnType<typeof mockUseWorkoutSessions>> = {}) {
  return {
    sessions: [],
    activeSession: null,
    sets: [],
    startSession: jest.fn(),
    endSession: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('セッションが1件も無い場合は空状態を表示する', () => {
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();
  expect(root.findByProps({ children: '＋ トレーニングを始める' })).toBeDefined();
});

test('空状態のボタンを押すとstartSessionが呼ばれ、成功したセッションIDへ遷移する', async () => {
  const startSession = jest.fn().mockResolvedValue({ id: 42 });
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ startSession }));
  const root = render();

  const startBtn = findButtonByLabel(root, '＋ トレーニングを始める')!;
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(startSession).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/42');
});

test('startSessionが失敗した場合はAlertが表示され、遷移しない', async () => {
  const startSession = jest.fn().mockRejectedValue(new Error('fail'));
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ startSession }));
  const root = render();

  const startBtn = findButtonByLabel(root, '＋ トレーニングを始める')!;
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('進行中セッションがある場合は再開バナーのみ表示し、矛盾する空状態は出さない', () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({ sessions: [activeSession], activeSession }),
  );
  const root = render();

  expect(findButtonByLabel(root, '進行中のトレーニングを再開する')).toBeDefined();
  expect(root.findAllByProps({ children: '＋ トレーニングを始める' })).toHaveLength(0);
  expect(findButtonByLabel(root, '＋ 開始')).toBeUndefined();
});

test('再開バナーを押すとstartSessionを呼ばず、activeSessionへ直接遷移する', async () => {
  const startSession = jest.fn();
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({ sessions: [activeSession], activeSession, startSession }),
  );
  const root = render();

  const resumeBanner = findButtonByLabel(root, '進行中のトレーニングを再開する')!;
  await act(async () => {
    await resumeBanner.props.onPress();
  });

  expect(startSession).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/9');
});

test('終了済みセッションがあり進行中が無い場合は履歴一覧とヘッダーの開始ボタンを表示する', () => {
  const finished = { id: 1, startedAt: new Date(2026, 6, 3, 9, 0).getTime(), endedAt: new Date(2026, 6, 3, 9, 45).getTime() };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({
      sessions: [finished],
      sets: [{ sessionId: 1, weight: 60, reps: 10 }],
    }),
  );
  const root = render();

  expect(findButtonByLabel(root, '＋ 開始')).toBeDefined();
  expect(root.findByProps({ children: '7月3日（金）' })).toBeDefined();
  expect(root.findByProps({ children: 1 })).toBeDefined(); // セット数チップ
  expect(root.findByProps({ children: 600 })).toBeDefined(); // 総量チップ (60*10)
});
