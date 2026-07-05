const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseWorkoutSession = jest.fn();
const mockUseSessionSetCount = jest.fn();
const mockUseSessionExercises = jest.fn();
const mockUseSessionSets = jest.fn();
const mockEndWorkoutSession = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // Stack.Screen はナビゲーターのoptionsを設定するコンポーネントで本来は見た目を持たないが、
  // headerRightの中身（タイマーチップ）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => unknown } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSession: (...args: unknown[]) => mockUseWorkoutSession(...args),
  useSessionSetCount: (...args: unknown[]) => mockUseSessionSetCount(...args),
  useSessionExercises: (...args: unknown[]) => mockUseSessionExercises(...args),
  useSessionSets: (...args: unknown[]) => mockUseSessionSets(...args),
  EMPTY_SETS: [],
}));

jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
}));

// SessionExerciseCard経由でreal @/db/clientまで読み込まれるのを防ぐ（expo-sqlite未モック環境で失敗するため）
jest.mock('@/lib/workout/sets', () => ({
  addSet: jest.fn(),
  deleteLastSet: jest.fn(),
  saveSet: jest.fn(),
  reopenSet: jest.fn(),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import WorkoutScreen from '@/app/workout/[id]';

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
    instance = create(React.createElement(WorkoutScreen));
  });
  return instance.root;
}

// 実時刻(Date.now())にすると、CI等の遅い環境でモジュール読み込みからテスト実行までの
// 間に1秒以上経過し、経過時間表示が「0:00」でなくなりflakyになる。固定時刻に統一する
const FIXED_NOW = new Date(2026, 6, 5, 12, 0, 0).getTime();
const activeSession = { id: 1, startedAt: FIXED_NOW, endedAt: null };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: '1' });
  mockUseSessionSetCount.mockReturnValue(0);
  mockUseSessionExercises.mockReturnValue([]);
  mockUseSessionSets.mockReturnValue(new Map());
  mockEndWorkoutSession.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

test('idが数値でない場合は「見つかりません」表示になる', () => {
  mockUseLocalSearchParams.mockReturnValue({ id: 'abc' });
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: false });
  const root = render();
  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();
});

test('セッションが見つからない場合、「戻る」を押すとrouter.backが呼ばれる', () => {
  mockUseWorkoutSession.mockReturnValue({ session: undefined, loaded: true });
  const root = render();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
});

test('セッションが見つかった場合、ネイティブヘッダーのタイマーを含む通常のトレーニング中画面を表示する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  // タイトル・戻るボタンはネイティブヘッダー（Stack.Screen options）が担うため、
  // ここではheaderRightに渡したタイマーが実際にレンダーされることだけを確認する
  expect(root.findByProps({ children: '0:00' })).toBeDefined();
  expect(findButtonByLabel(root, '種目を追加')).toBeDefined();
  expect(findButtonByLabel(root, 'トレーニングを終了')).toBeDefined();
});

test('1分経過するとタイマー表示が更新される', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  expect(root.findByProps({ children: '0:00' })).toBeDefined();

  act(() => {
    jest.advanceTimersByTime(60_000);
  });

  expect(root.findByProps({ children: '1:00' })).toBeDefined();
});

test('セッション終了後（endedAt有り）はタイマーを更新し続けない', () => {
  const finishedSession = { id: 1, startedAt: FIXED_NOW - 5000, endedAt: FIXED_NOW };
  mockUseWorkoutSession.mockReturnValue({ session: finishedSession, loaded: true });
  const root = render();

  const before = root.findByProps({ children: '0:05' });
  expect(before).toBeDefined();

  act(() => {
    jest.advanceTimersByTime(60_000);
  });

  // intervalが張られていないので表示は変わらない
  expect(root.findByProps({ children: '0:05' })).toBeDefined();
});

test('セット0件で終了を押すと確認ダイアログが出て、確定するとendWorkoutSessionが呼ばれる', async () => {
  mockUseSessionSetCount.mockReturnValue(0);
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '終了する');
    confirmBtn?.onPress?.();
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'トレーニングを終了',
    'まだ種目を記録していません。終了しますか？',
    expect.anything(),
  );
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockBack).toHaveBeenCalled();
});

test('セット0件で終了確認をキャンセルするとendWorkoutSessionは呼ばれない', async () => {
  mockUseSessionSetCount.mockReturnValue(0);
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(mockEndWorkoutSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('セットが1件以上ある場合は確認ダイアログを出さず即座に終了する', async () => {
  mockUseSessionSetCount.mockReturnValue(3);
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockEndWorkoutSession).toHaveBeenCalledWith(1);
  expect(mockBack).toHaveBeenCalled();
});

test('連打してもendWorkoutSession/router.backは1回しか呼ばれない（二重終了の防止）', async () => {
  let resolveEnd!: () => void;
  mockUseSessionSetCount.mockReturnValue(3);
  mockEndWorkoutSession.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveEnd = resolve;
    }),
  );
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  act(() => {
    finishBtn.props.onPress();
    finishBtn.props.onPress();
  });

  expect(mockEndWorkoutSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveEnd();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('endWorkoutSessionが失敗した場合はエラーAlertが表示され、router.backは呼ばれない', async () => {
  mockUseSessionSetCount.mockReturnValue(3);
  mockEndWorkoutSession.mockRejectedValueOnce(new Error('fail'));
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });

  const root = render();
  const finishBtn = findButtonByLabel(root, 'トレーニングを終了')!;
  await act(async () => {
    finishBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', 'トレーニングを終了できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('種目を追加ボタンを押すと種目追加ピッカーへ遷移する', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  const root = render();

  const addBtn = findButtonByLabel(root, '種目を追加')!;
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workout/exercise-picker',
    params: { sessionId: '1' },
  });
});

test('種目が追加済みの場合は一覧表示になり、空状態は表示されない', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0 },
    { id: 11, name: 'スクワット', category: 'legs', measurementType: 'weight_reps', orderIndex: 1 },
  ]);
  const root = render();

  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
  expect(() => root.findByProps({ children: 'まだ種目がありません' })).toThrow();
  expect(findButtonByLabel(root, '種目を追加')).toBeDefined();
});

test('useSessionSetsの中身が正しいexerciseIdのカードに渡る', () => {
  mockUseWorkoutSession.mockReturnValue({ session: activeSession, loaded: true });
  mockUseSessionExercises.mockReturnValue([
    { id: 10, name: 'ベンチプレス', category: 'chest', measurementType: 'weight_reps', orderIndex: 0 },
    { id: 11, name: 'スクワット', category: 'legs', measurementType: 'weight_reps', orderIndex: 1 },
  ]);
  mockUseSessionSets.mockReturnValue(
    new Map([[10, [{ id: 1, setNumber: 1, weight: 60, reps: 10, completedAt: 1 }]]]),
  );
  const root = render();

  // ベンチプレス(id:10)には1件のセット行、スクワット(id:11)には対応するセットが無いので0件
  const checkboxes = root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.accessibilityRole === 'checkbox');
  expect(checkboxes).toHaveLength(1);
});
