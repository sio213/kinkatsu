const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();
const mockStartPastWorkoutFromRoutine = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutines: () => mockUseRoutines(),
  useRoutineExerciseSummaries: () => mockUseRoutineExerciseSummaries(),
}));

jest.mock('@/lib/workout/session', () => ({
  startPastWorkoutFromRoutine: (...args: unknown[]) => mockStartPastWorkoutFromRoutine(...args),
}));

import PastRoutinePickerScreen from '@/app/workout/past-routine-picker';
import type { Routine } from '@/db/schema';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';

function baseRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: 1, name: '胸の日', orderIndex: 0, createdAt: 0, updatedAt: 0, ...overrides };
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(PastRoutinePickerScreen));
  });
  return instance.root;
}

function findCardByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes(label));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-07-25' });
  mockUseRoutines.mockReturnValue({ routines: [] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('ヘッダーに対象日をサブタイトルとして表示する', () => {
  const root = render();
  expect(root.findByProps({ children: 'ルーティンを選択' })).toBeDefined();
  expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
});

test('ルーティンが0件なら空状態を表示し、戻るボタンでrouter.backする', () => {
  const root = render();
  expect(root.findByProps({ children: 'ルーティンがまだありません' })).toBeDefined();

  const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});

test('カードをタップすると、選択日の正午時刻でstartPastWorkoutFromRoutineを呼び、時刻選択画面を挟まずワークアウト画面へ遷移する', async () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 2, categories: ['chest'] }]]));
  mockStartPastWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  const root = render();

  const card = findCardByLabel(root, '胸の日')!;
  await act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockStartPastWorkoutFromRoutine).toHaveBeenCalledTimes(1);
  const [routineId, pastDate] = mockStartPastWorkoutFromRoutine.mock.calls[0];
  expect(routineId).toBe(10);
  const calledWith = new Date(pastDate);
  expect(calledWith.getFullYear()).toBe(2026);
  expect(calledWith.getMonth()).toBe(6);
  expect(calledWith.getDate()).toBe(25);
  expect(calledWith.getHours()).toBe(12);
  expect(mockPush).toHaveBeenCalledWith('/workout/77');
});

// schedule-routine-picker-screen.test.tsxの「連打してもpushは1回」と同水準（@tester指摘:
// DB書き込み(startPastWorkoutFromRoutine)を伴う分、こちらの方が優先度が高い）。
// ここではuseWorkoutStarterのisStartingRefガード（実装をモックせず使用）で防止される
test('カードを連打してもstartPastWorkoutFromRoutineは1回しか呼ばれない（useWorkoutStarterのisStartingRefによる二重生成防止）', async () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 2, categories: ['chest'] }]]));
  let resolveStart!: (v: { sessionId: number; cards: never[] }) => void;
  mockStartPastWorkoutFromRoutine.mockReturnValue(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const root = render();
  const card = findCardByLabel(root, '胸の日')!;

  act(() => {
    card.props.onPress();
    card.props.onPress();
  });
  expect(mockStartPastWorkoutFromRoutine).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveStart({ sessionId: 1, cards: [] });
    await Promise.resolve();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('複数ルーティンが表示された状態で、押したカードに対応するroutineIdが渡る（先頭固定になっていないことの確認）', async () => {
  mockUseRoutines.mockReturnValue({
    routines: [baseRoutine({ id: 10, name: '胸の日' }), baseRoutine({ id: 20, name: '脚の日' })],
  });
  mockUseRoutineExerciseSummaries.mockReturnValue(
    new Map([
      [10, { exerciseCount: 2, categories: ['chest'] }],
      [20, { exerciseCount: 3, categories: ['leg'] }],
    ]),
  );
  mockStartPastWorkoutFromRoutine.mockResolvedValue({ sessionId: 88, cards: [] });
  const root = render();

  const card = findCardByLabel(root, '脚の日')!;
  await act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockStartPastWorkoutFromRoutine.mock.calls[0][0]).toBe(20);
  expect(mockPush).toHaveBeenCalledWith('/workout/88');
});

test('startPastWorkoutFromRoutineが失敗した場合はエラーAlertを表示し、遷移しない', async () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 1, categories: [] }]]));
  mockStartPastWorkoutFromRoutine.mockRejectedValue(new Error('db error'));
  const root = render();

  const card = findCardByLabel(root, '胸の日')!;
  await act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
  expect(mockPush).not.toHaveBeenCalled();
});

test('該当ルーティンが見つからない場合(startPastWorkoutFromRoutineがnullを返す)は遷移しない', async () => {
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 1, categories: [] }]]));
  mockStartPastWorkoutFromRoutine.mockResolvedValue(null);
  const root = render();

  const card = findCardByLabel(root, '胸の日')!;
  await act(async () => {
    card.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockPush).not.toHaveBeenCalled();
});

test('pastDateKeyが不正な形式の場合は「見つかりません」画面になる（parseDateKeyへ渡してクラッシュしないためのガード）', () => {
  mockUseLocalSearchParams.mockReturnValue({ pastDateKey: 'not-a-date' });
  mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  expect(() => root.findByProps({ children: '胸の日' })).toThrow();
});

test('pastDateKeyが無い(undefined)場合も「見つかりません」画面になり、戻るボタンでrouter.backする', () => {
  mockUseLocalSearchParams.mockReturnValue({ pastDateKey: undefined });
  const root = render();
  expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
  const backBtn = root.findAllByType(TouchableOpacity).find((btn) => btn.props.accessibilityLabel === '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });
  expect(mockBack).toHaveBeenCalled();
});
