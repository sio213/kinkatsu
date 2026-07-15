const mockPush = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();
const mockUseRoutineReminders = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockStartWorkoutFromRoutine = jest.fn();
const mockEndWorkoutSession = jest.fn();
const mockResetDraft = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => mockUseRoutines(),
  useRoutineExerciseSummaries: () => mockUseRoutineExerciseSummaries(),
  useRoutineReminders: () => mockUseRoutineReminders(),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
}));

jest.mock('@/lib/workout/session', () => ({
  startWorkoutFromRoutine: (...args: unknown[]) => mockStartWorkoutFromRoutine(...args),
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
}));

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: { reset: () => void }) => unknown) => selector({ reset: mockResetDraft }),
}));

import RoutineListScreen from '@/app/routine/index';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';

function findByAccessibilityLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

function findByAccessibilityHint(root: ReactTestInstance, hint: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityHint === hint);
}

function findStartButton(root: ReactTestInstance, routineName: string) {
  return findByAccessibilityLabel(root, `「${routineName}」のトレーニングを開始`)!;
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(RoutineListScreen));
  });
  return instance.root;
}

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸トレ', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function baseSessions(overrides: Partial<ReturnType<typeof mockUseWorkoutSessions>> = {}) {
  return { sessions: [], activeSession: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine()],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
    duplicateRoutine: jest.fn(),
  });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
  mockUseRoutineReminders.mockReturnValue(new Map());
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('カード本体をタップすると、ワークアウトは開始されずに編集画面へ遷移する', async () => {
  const root = render();

  const card = findByAccessibilityHint(root, 'タップして編集画面を開きます')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/edit/1');
  expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
});

test('「開始」ボタンをタップすると、ルーティンの中身入りでワークアウトが開始され、そのセッションへ遷移する', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(1);
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

test('進行中セッションが既にある場合、開始ボタンを押しても無言で遷移せず、確認のAlertを出す', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [activeSession], activeSession }));
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  act(() => {
    startBtn.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    '実施中のトレーニングを終了しますか？',
    'ここまでの記録を保存して「胸トレ」を開始しますか？',
    expect.any(Array),
  );
});

test('進行中セッションがある場合のAlertで「記録して開始」を選ぶと、進行中セッションを終了してから新しいルーティンのセッションへ遷移する', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [activeSession], activeSession }));
  mockEndWorkoutSession.mockResolvedValue(undefined);
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  act(() => {
    startBtn.props.onPress();
  });

  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '記録して開始');
  await act(async () => {
    await confirmAction.onPress();
  });

  expect(mockEndWorkoutSession).toHaveBeenCalledWith(9);
  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(1);
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

test('進行中セッションが無い場合はAlertを出さず、そのままワークアウトを開始する', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

test('startWorkoutFromRoutineが失敗した場合はAlertを表示し、遷移しない', async () => {
  mockStartWorkoutFromRoutine.mockRejectedValue(new Error('db error'));
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('該当ルーティンが見つからない場合(startWorkoutFromRoutineがnullを返す)は遷移しない', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue(null);
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(mockPush).not.toHaveBeenCalled();
});

test('複数カードがある場合、2枚目の開始ボタンを押すと2枚目のroutineIdでstartWorkoutFromRoutineが呼ばれる（1枚目のidを誤って捕まえていないことの確認）', async () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 1, name: '胸トレ' }), baseRoutine({ id: 2, name: '脚トレ' })],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
  });
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 88, cards: [] });
  const root = render();

  const startBtn = findStartButton(root, '脚トレ');
  await act(async () => {
    await startBtn.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(2);
  expect(mockPush).toHaveBeenCalledWith('/workout/88');
});

test('⋮メニューの「編集」は引き続きルーティン編集画面へ遷移する(カード本体タップと同じ遷移先であることの確認)', async () => {
  const root = render();

  const menuTrigger = findByAccessibilityLabel(root, 'メニューを開く')!;
  act(() => {
    menuTrigger.props.onPress();
  });

  const editItem = findByAccessibilityLabel(root, '編集')!;
  act(() => {
    editItem.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/routine/edit/1');
  expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
});

test('⋮メニューの「複製」を押すと、複製後の新しいIDで名前欄オートフォーカス付きの編集画面へ遷移する', async () => {
  const mockDuplicateRoutine = jest.fn().mockResolvedValue(42);
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine()],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
    duplicateRoutine: mockDuplicateRoutine,
  });
  const root = render();

  const menuTrigger = findByAccessibilityLabel(root, 'メニューを開く')!;
  act(() => {
    menuTrigger.props.onPress();
  });

  const duplicateItem = findByAccessibilityLabel(root, '複製')!;
  await act(async () => {
    await duplicateItem.props.onPress();
  });

  expect(mockDuplicateRoutine).toHaveBeenCalledWith(1);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/routine/edit/[id]',
    params: { id: '42', focusName: '1' },
  });
});

test('複製が失敗した場合はAlertを表示し、遷移しない', async () => {
  const mockDuplicateRoutine = jest.fn().mockRejectedValue(new Error('db error'));
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine()],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
    duplicateRoutine: mockDuplicateRoutine,
  });
  const root = render();

  const menuTrigger = findByAccessibilityLabel(root, 'メニューを開く')!;
  act(() => {
    menuTrigger.props.onPress();
  });

  const duplicateItem = findByAccessibilityLabel(root, '複製')!;
  await act(async () => {
    await duplicateItem.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'ルーティンの複製に失敗しました。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('複数カードがある場合、2枚目の複製で正しいroutineId（1枚目ではない）が渡される', async () => {
  const mockDuplicateRoutine = jest.fn().mockResolvedValue(99);
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 1, name: '胸トレ' }), baseRoutine({ id: 2, name: '脚トレ' })],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
    duplicateRoutine: mockDuplicateRoutine,
  });
  const root = render();

  const menuTriggers = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityLabel === 'メニューを開く');
  act(() => {
    menuTriggers[1].props.onPress();
  });

  const duplicateItem = findByAccessibilityLabel(root, '複製')!;
  await act(async () => {
    await duplicateItem.props.onPress();
  });

  expect(mockDuplicateRoutine).toHaveBeenCalledWith(2);
});

test('連打してもstartWorkoutFromRoutineは1回しか呼ばれない（二重セッション生成の防止）', async () => {
  let resolveStart!: (v: { sessionId: number; cards: never[] }) => void;
  mockStartWorkoutFromRoutine.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  act(() => {
    startBtn.props.onPress();
    startBtn.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveStart({ sessionId: 1, cards: [] });
  });
});

test('endWorkoutSessionが失敗した場合、startWorkoutFromRoutineは呼ばれず、エラーAlertを表示して遷移しない（進行中セッションを終了できないまま新規セッションを二重に作らない）', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [activeSession], activeSession }));
  mockEndWorkoutSession.mockRejectedValue(new Error('db error'));
  const root = render();

  const startBtn = findStartButton(root, '胸トレ');
  act(() => {
    startBtn.props.onPress();
  });

  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '記録して開始');
  await act(async () => {
    await confirmAction.onPress();
  });

  expect(mockEndWorkoutSession).toHaveBeenCalledWith(9);
  expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('1枚目の開始ボタンの処理が終わる前に2枚目の開始ボタンを押しても無視される（連打防止がカード横断で共有されていることの確認）', async () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 1, name: '胸トレ' }), baseRoutine({ id: 2, name: '脚トレ' })],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
  });
  let resolveStart!: (v: { sessionId: number; cards: never[] }) => void;
  mockStartWorkoutFromRoutine.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const root = render();

  act(() => {
    findStartButton(root, '胸トレ').props.onPress();
    findStartButton(root, '脚トレ').props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledTimes(1);
  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(1);

  await act(async () => {
    resolveStart({ sessionId: 1, cards: [] });
  });
});
