const mockPush = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();
const mockUseRoutineReminders = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockStartWorkoutFromRoutine = jest.fn();
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
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine()], removeRoutine: jest.fn(), swapOrder: jest.fn() });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
  mockUseRoutineReminders.mockReturnValue(new Map());
  mockUseWorkoutSessions.mockReturnValue(baseSessions());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('カード本体をタップすると、ルーティンの中身入りでワークアウトが開始され、そのセッションへ遷移する', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  await act(async () => {
    await card.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(1);
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

test('進行中セッションが既にある場合、カードをタップしても無言で遷移せず、確認のAlertを出す', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [activeSession], activeSession }));
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  act(() => {
    card.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    '別のトレーニングが進行中です',
    '先に進行中のトレーニングを終了してから開始してください。',
    expect.any(Array),
  );
});

test('進行中セッションがある場合のAlertで「進行中のトレーニングを開く」を選ぶと、そちらへ遷移する', async () => {
  const activeSession = { id: 9, startedAt: 0, endedAt: null };
  mockUseWorkoutSessions.mockReturnValue(baseSessions({ sessions: [activeSession], activeSession }));
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  act(() => {
    card.props.onPress();
  });

  const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
  const openAction = alertCall[2].find((b: { text?: string }) => b.text === '進行中のトレーニングを開く');
  act(() => {
    openAction.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/workout/9');
});

test('進行中セッションが無い場合はAlertを出さず、そのままワークアウトを開始する', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  await act(async () => {
    await card.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

test('startWorkoutFromRoutineが失敗した場合はAlertを表示し、遷移しない', async () => {
  mockStartWorkoutFromRoutine.mockRejectedValue(new Error('db error'));
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  await act(async () => {
    await card.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('該当ルーティンが見つからない場合(startWorkoutFromRoutineがnullを返す)は遷移しない', async () => {
  mockStartWorkoutFromRoutine.mockResolvedValue(null);
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  await act(async () => {
    await card.props.onPress();
  });

  expect(mockPush).not.toHaveBeenCalled();
});

test('複数カードがある場合、2枚目のカードをタップすると2枚目のroutineIdでstartWorkoutFromRoutineが呼ばれる（1枚目のidを誤って捕まえていないことの確認）', async () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 1, name: '胸トレ' }), baseRoutine({ id: 2, name: '脚トレ' })],
    removeRoutine: jest.fn(),
    swapOrder: jest.fn(),
  });
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 88, cards: [] });
  const root = render();

  const cards = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityHint === 'タップしてトレーニングを開始します');
  expect(cards).toHaveLength(2);

  await act(async () => {
    await cards[1].props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(2);
  expect(mockPush).toHaveBeenCalledWith('/workout/88');
});

test('⋮メニューの「編集」は引き続きルーティン編集画面へ遷移する(カード本体タップの変更と混線していないことの確認)', async () => {
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

test('連打してもstartWorkoutFromRoutineは1回しか呼ばれない（二重セッション生成の防止）', async () => {
  let resolveStart!: (v: { sessionId: number; cards: never[] }) => void;
  mockStartWorkoutFromRoutine.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const root = render();

  const card = findByAccessibilityHint(root, 'タップしてトレーニングを開始します')!;
  act(() => {
    card.props.onPress();
    card.props.onPress();
  });

  expect(mockStartWorkoutFromRoutine).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveStart({ sessionId: 1, cards: [] });
  });
});
