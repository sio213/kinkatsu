const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockSwapSessionExercise = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/lib/workout/session', () => ({
  swapSessionExercise: (...args: unknown[]) => mockSwapSessionExercise(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import ExerciseSwapScreen from '@/app/workout/exercise-swap';

const benchPress = {
  id: 10,
  name: 'ベンチプレス',
  category: 'chest',
  favorite: false,
  source: 'preset',
  measurementType: 'weight_reps',
};
const inclineBenchPress = {
  id: 11,
  name: 'インクラインベンチプレス',
  category: 'chest',
  favorite: false,
  source: 'preset',
  measurementType: 'weight_reps',
};
const running = {
  id: 12,
  name: 'ランニング',
  category: 'cardio',
  favorite: false,
  source: 'preset',
  measurementType: 'distance_time',
};

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
    instance = create(React.createElement(ExerciseSwapScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentMeasurementType: 'weight_reps',
  });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, inclineBenchPress, running] });
  mockSwapSessionExercise.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('現在の種目（currentExerciseId）は候補一覧から除外される', () => {
  const root = render();
  expect(() => root.findByProps({ accessibilityLabel: 'ベンチプレスに入れ替える' })).toThrow();
  expect(root.findByProps({ accessibilityLabel: 'インクラインベンチプレスに入れ替える' })).toBeDefined();
  expect(root.findByProps({ accessibilityLabel: 'ランニングに入れ替える' })).toBeDefined();
});

test('計測タイプが同じ種目をタップすると確認なしですぐswapSessionExerciseが呼ばれ、router.backする', async () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: 'インクラインベンチプレスに入れ替える' });
  await act(async () => {
    row.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockSwapSessionExercise).toHaveBeenCalledWith(500, 11);
  expect(mockBack).toHaveBeenCalled();
});

test('計測タイプが異なる種目をタップすると確認ダイアログを出し、確定するとswapSessionExerciseが呼ばれる', async () => {
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '入れ替える');
    confirmBtn?.onPress?.();
  });
  const root = render();
  const row = root.findByProps({ accessibilityLabel: 'ランニングに入れ替える' });
  await act(async () => {
    row.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    'この種目に入れ替えますか？',
    '入力済みの記録は失われます。',
    expect.anything(),
  );
  expect(mockSwapSessionExercise).toHaveBeenCalledWith(500, 12);
  expect(mockBack).toHaveBeenCalled();
});

test('計測タイプが異なる種目の確認をキャンセルするとswapSessionExerciseは呼ばれない', async () => {
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = render();
  const row = root.findByProps({ accessibilityLabel: 'ランニングに入れ替える' });
  await act(async () => {
    row.props.onPress();
  });

  expect(mockSwapSessionExercise).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('入れ替えが失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockSwapSessionExercise.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render();
  const row = root.findByProps({ accessibilityLabel: 'インクラインベンチプレスに入れ替える' });
  await act(async () => {
    row.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を入れ替えられませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('連打してもswapSessionExerciseは1回しか呼ばれない', async () => {
  let resolveSwap!: () => void;
  mockSwapSessionExercise.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveSwap = resolve;
    }),
  );
  const root = render();
  const row = root.findByProps({ accessibilityLabel: 'インクラインベンチプレスに入れ替える' });
  act(() => {
    row.props.onPress();
    row.props.onPress();
  });

  expect(mockSwapSessionExercise).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveSwap();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('sessionExerciseIdが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: 'abc',
    currentExerciseId: '10',
    currentMeasurementType: 'weight_reps',
  });
  const root = render();

  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockSwapSessionExercise).not.toHaveBeenCalled();
});

test('ⓘボタンを押すと種目詳細へ遷移する', () => {
  const root = render();
  const infoButtons = root
    .findAllByType(TouchableOpacity)
    .filter((btn: ReactTestInstance) => btn.props.accessibilityLabel === 'インクラインベンチプレスの詳細を見る');
  expect(infoButtons.length).toBe(1);

  act(() => {
    infoButtons[0].props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/11');
});
