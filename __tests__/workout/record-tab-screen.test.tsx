const mockPush = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockUseSessionStats = jest.fn();
const mockStartWorkoutSession = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（開始ボタン）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => {
      const { createElement, Fragment } = require('react');
      return createElement(Fragment, null, options?.headerRight?.());
    },
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
  useSessionStats: () => mockUseSessionStats(),
}));

jest.mock('@/lib/workout/session', () => ({
  startWorkoutSession: (...args: unknown[]) => mockStartWorkoutSession(...args),
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
  return { sessions: [], activeSession: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSessionStats.mockReturnValue(new Map());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('セッションが1件も無い場合は空状態を表示する', () => {
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();
  expect(root.findByProps({ children: '＋ トレーニングを始める' })).toBeDefined();
});

test('セッションが1件も無い初期状態ではヘッダーの開始ボタンを表示しない', () => {
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();
  expect(findButtonByLabel(root, '開始')).toBeUndefined();
});

test('空状態のボタンを押すとstartWorkoutSessionが呼ばれ、成功したセッションIDへ遷移する', async () => {
  mockStartWorkoutSession.mockResolvedValue({ id: 42 });
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();

  const startBtn = findButtonByLabel(root, '＋ トレーニングを始める')!;
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(mockStartWorkoutSession).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/42');
});

test('startWorkoutSessionが失敗した場合はAlertが表示され、遷移しない', async () => {
  mockStartWorkoutSession.mockRejectedValue(new Error('fail'));
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();

  const startBtn = findButtonByLabel(root, '＋ トレーニングを始める')!;
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('連打してもstartWorkoutSessionは1回しか呼ばれない（二重セッション生成の防止）', async () => {
  let resolveStart!: (v: { id: number }) => void;
  mockStartWorkoutSession.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();

  const startBtn = findButtonByLabel(root, '＋ トレーニングを始める')!;
  act(() => {
    startBtn.props.onPress();
    startBtn.props.onPress();
  });

  expect(mockStartWorkoutSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveStart({ id: 1 });
  });
});

test('進行中セッションがある場合は再開バナーのみ表示し、矛盾する空状態は出さない', () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({ sessions: [activeSession], activeSession }),
  );
  const root = render();

  expect(findButtonByLabel(root, '進行中のトレーニングを再開する')).toBeDefined();
  expect(root.findAllByProps({ children: '＋ トレーニングを始める' })).toHaveLength(0);
  expect(findButtonByLabel(root, '開始')).toBeUndefined();
});

test('進行中セッションと終了済みセッションが両方ある場合もヘッダーの開始ボタンは表示しない', () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  const finished = {
    id: 1,
    startedAt: new Date(2026, 6, 3, 9, 0).getTime(),
    endedAt: new Date(2026, 6, 3, 9, 45).getTime(),
  };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({ sessions: [activeSession, finished], activeSession }),
  );
  mockUseSessionStats.mockReturnValue(new Map([[1, { setCount: 1, totalVolume: 600 }]]));
  const root = render();

  expect(findButtonByLabel(root, '開始')).toBeUndefined();
  expect(findButtonByLabel(root, '進行中のトレーニングを再開する')).toBeDefined();
});

test('再開バナーを押すとstartWorkoutSessionを呼ばず、activeSessionへ直接遷移する', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(
    baseSessions({ sessions: [activeSession], activeSession }),
  );
  const root = render();

  const resumeBanner = findButtonByLabel(root, '進行中のトレーニングを再開する')!;
  await act(async () => {
    await resumeBanner.props.onPress();
  });

  expect(mockStartWorkoutSession).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/9');
});

test('終了済みセッションがあり進行中が無い場合は履歴一覧とヘッダーの開始ボタンを表示する', () => {
  const finished = {
    id: 1,
    startedAt: new Date(2026, 6, 3, 9, 0).getTime(),
    endedAt: new Date(2026, 6, 3, 9, 45).getTime(),
  };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [finished] }));
  mockUseSessionStats.mockReturnValue(new Map([[1, { setCount: 1, totalVolume: 600 }]]));
  const root = render();

  expect(findButtonByLabel(root, '開始')).toBeDefined();
  expect(root.findByProps({ children: '7月3日（金）' })).toBeDefined();
  expect(root.findByProps({ children: 1 })).toBeDefined(); // セット数チップ
  expect(root.findByProps({ children: 600 })).toBeDefined(); // 総量チップ
});

test('過去の記録カードをタップすると、そのセッションIDの記録編集画面へ遷移する', async () => {
  const finished = {
    id: 7,
    startedAt: new Date(2026, 6, 3, 9, 0).getTime(),
    endedAt: new Date(2026, 6, 3, 9, 45).getTime(),
  };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [finished] }));
  mockUseSessionStats.mockReturnValue(new Map([[7, { setCount: 1, totalVolume: 600 }]]));
  const root = render();

  const card = root
    .findAllByType(TouchableOpacity)
    .find((t) => t.props.accessibilityLabel === 'トレーニング記録を編集')!;
  await act(async () => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/workout/7');
});

test('ルーティン一覧への導線ボタンは常に表示され、タップするとルーティン一覧へ遷移する(タブ構成に専用入口が無い間の暫定の橋渡し)', () => {
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  const root = render();

  const routineLink = findButtonByLabel(root, 'ルーティン一覧')!;
  act(() => {
    routineLink.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine');
});
