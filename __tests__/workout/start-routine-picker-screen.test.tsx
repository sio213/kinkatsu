const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseRoutines = jest.fn();
const mockUseRoutineExerciseSummaries = jest.fn();
const mockStartPastWorkoutFromRoutine = jest.fn();
const mockStartWorkoutFromRoutine = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, dismiss: mockDismiss }),
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
  startWorkoutFromRoutine: (...args: unknown[]) => mockStartWorkoutFromRoutine(...args),
}));

import StartRoutinePickerScreen from '@/app/workout/start-routine-picker';
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
    instance = create(React.createElement(StartRoutinePickerScreen));
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
  // pastDateKey無し = 今日のライブ開始（デフォルト、既存挙動）
  mockUseLocalSearchParams.mockReturnValue({});
  mockUseRoutines.mockReturnValue({ routines: [] });
  mockUseRoutineExerciseSummaries.mockReturnValue(new Map());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

// 今日のライブ開始（2026-07-20: start-chooserの「ルーティン」がフルCRUD一覧
// app/routine/index.tsxではなくこの専用ピッカーに統一された。要件確認済み）
describe('今日のライブ開始（pastDateKeyなし）', () => {
  test('カードをタップすると、startWorkoutFromRoutineを呼び即座にワークアウト画面へ遷移する（進行中セッション確認は挟まない）', async () => {
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
    mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 2, categories: ['chest'] }]]));
    mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 42, cards: [] });
    const root = render();

    const card = findCardByLabel(root, '胸の日')!;
    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(10);
    expect(mockStartPastWorkoutFromRoutine).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    // dismiss(2)でこの画面自身+start-chooserを閉じてからpushする（@ユーザー指摘: 単純pushだと
    // start-chooser等がスタックに残り、/workout/{id}の「戻る」で呼び出し元まで戻れなかった）
    expect(mockDismiss).toHaveBeenCalledWith(2);
    expect(mockPush).toHaveBeenCalledWith('/workout/42');
  });

  test('カードを連打してもstartWorkoutFromRoutineは1回しか呼ばれない（useWorkoutStarterのisStartingRefによる二重生成防止）', async () => {
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
    mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 2, categories: ['chest'] }]]));
    let resolveStart!: (v: { sessionId: number; cards: never[] }) => void;
    mockStartWorkoutFromRoutine.mockReturnValue(
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
    expect(mockStartWorkoutFromRoutine).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart({ sessionId: 1, cards: [] });
      await Promise.resolve();
    });
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test('startWorkoutFromRoutineが失敗した場合はエラーAlertを表示し、遷移しない', async () => {
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
    mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 1, categories: [] }]]));
    mockStartWorkoutFromRoutine.mockRejectedValue(new Error('db error'));
    const root = render();

    const card = findCardByLabel(root, '胸の日')!;
    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを開始できませんでした。');
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('該当ルーティンが見つからない場合(startWorkoutFromRoutineがnullを返す)は遷移しない', async () => {
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
    mockUseRoutineExerciseSummaries.mockReturnValue(new Map([[10, { exerciseCount: 1, categories: [] }]]));
    mockStartWorkoutFromRoutine.mockResolvedValue(null);
    const root = render();

    const card = findCardByLabel(root, '胸の日')!;
    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// カレンダー過去日パネル「記録を追加」→start-chooserの「ルーティン」経由（pastDateKey付き）
describe('過去日の事後記録（pastDateKey付き）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: '2026-07-25' });
  });

  test('ヘッダーに対象日をサブタイトルとして表示する', () => {
    const root = render();
    expect(root.findByProps({ children: 'ルーティンを選択' })).toBeDefined();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  });

  // @tester指摘: リネーム前は過去日モード配下にあった0件テストが、今日モードのデフォルトに
  // 紛れて過去日モード側から抜け落ちていた。ヘッダーの日付サブタイトルと空状態が同時に
  // 出るケースを明示的に確認する
  test('ルーティンが0件でも対象日のサブタイトルは表示されたまま、空状態を表示する', () => {
    const root = render();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
    expect(root.findByProps({ children: 'ルーティンがまだありません' })).toBeDefined();
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

    expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
    expect(mockStartPastWorkoutFromRoutine).toHaveBeenCalledTimes(1);
    const [routineId, pastDate] = mockStartPastWorkoutFromRoutine.mock.calls[0];
    expect(routineId).toBe(10);
    const calledWith = new Date(pastDate);
    expect(calledWith.getFullYear()).toBe(2026);
    expect(calledWith.getMonth()).toBe(6);
    expect(calledWith.getDate()).toBe(25);
    expect(calledWith.getHours()).toBe(12);
    expect(mockDismiss).toHaveBeenCalledWith(2);
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
    expect(mockDismiss).toHaveBeenCalledTimes(1);
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
    expect(mockDismiss).toHaveBeenCalledWith(2);
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
    expect(mockDismiss).not.toHaveBeenCalled();
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

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('pastDateKeyが不正な形式の場合は「見つかりません」画面になる（parseDateKeyへ渡してクラッシュしないためのガード）', () => {
    mockUseLocalSearchParams.mockReturnValue({ pastDateKey: 'not-a-date' });
    mockUseRoutines.mockReturnValue({ routines: [baseRoutine({ id: 10, name: '胸の日' })] });
    const root = render();
    expect(root.findByProps({ children: '日付が見つかりません' })).toBeDefined();
    expect(() => root.findByProps({ children: '胸の日' })).toThrow();
  });
});
