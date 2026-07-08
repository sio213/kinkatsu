const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockReplaceSessionExercise = jest.fn();
const mockUseExerciseUsageStats = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
  // headerTitleの中身（現在の種目名）をテストで検証できるよう、そのレンダー関数だけ実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/hooks/use-exercise-usage-stats', () => ({
  useExerciseUsageStats: (...args: unknown[]) => mockUseExerciseUsageStats(...args),
}));

jest.mock('@/lib/workout/session', () => ({
  replaceSessionExercise: (...args: unknown[]) => mockReplaceSessionExercise(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import ExerciseSwapScreen from '@/app/workout/exercise-swap';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';

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

const inclineBenchPressLabel = 'インクラインベンチプレス、胸';
const runningLabel = 'ランニング、有酸素';

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
    sessionId: '1',
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, inclineBenchPress, running] });
  mockUseExerciseUsageStats.mockReturnValue(new Map());
  mockReplaceSessionExercise.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // zustandのstoreはモジュールシングルトンでテスト間を跨いで共有されるため、
  // 前のテストで選んだ並び替え軸が漏れないようデフォルトへ戻す
  useExerciseSortStore.setState({ swapSortBy: 'frequent' });
});

test('現在の種目名がヘッダー付近に表示される', () => {
  const root = render();
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
});

test('現在の種目（currentExerciseId）は候補一覧から除外される', () => {
  const root = render();
  expect(() => root.findByProps({ accessibilityLabel: 'ベンチプレス、胸' })).toThrow();
  expect(root.findByProps({ accessibilityLabel: inclineBenchPressLabel })).toBeDefined();
  expect(root.findByProps({ accessibilityLabel: runningLabel })).toBeDefined();
});

test('初期状態は未選択で「入れ替える」ボタンは無効', () => {
  const root = render();
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  expect(submitBtn.props.disabled).toBe(true);
});

test('種目をタップするとラジオボタンが選択状態になり、「入れ替える」ボタンが有効になる', () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: inclineBenchPressLabel });
  act(() => {
    row.props.onPress();
  });

  expect(root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.accessibilityState).toEqual({
    checked: true,
  });
  expect(findButtonByLabel(root, '入れ替える')!.props.disabled).toBe(false);
});

test('別の種目をタップすると選択が移る（単一選択）', () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });
  act(() => {
    root.findByProps({ accessibilityLabel: runningLabel }).props.onPress();
  });

  expect(root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.accessibilityState).toEqual({
    checked: false,
  });
  expect(root.findByProps({ accessibilityLabel: runningLabel }).props.accessibilityState).toEqual({
    checked: true,
  });
});

test('記録済みデータが無ければ、確認なしですぐreplaceSessionExerciseが呼ばれ、router.backする', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockReplaceSessionExercise).toHaveBeenCalledWith(500, 11);
  expect(mockBack).toHaveBeenCalled();
});

test('記録済みデータがあれば、選んだ種目名を含む確認ダイアログを出し、確定するとreplaceSessionExerciseが呼ばれる（種目の計測タイプ一致・不一致に関わらず、入れ替え後は新規登録と同様にリセットされるため）', async () => {
  (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = buttons?.find((b: { text: string }) => b.text === '入れ替える');
    confirmBtn?.onPress?.();
  });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith(
    '「インクラインベンチプレス」に入れ替えますか？',
    '入力済みの記録は失われます。',
    expect.anything(),
  );
  expect(mockReplaceSessionExercise).toHaveBeenCalledWith(500, 11);
  expect(mockBack).toHaveBeenCalled();
});

test('確認をキャンセルするとreplaceSessionExerciseは呼ばれない', async () => {
  (Alert.alert as jest.Mock).mockImplementation(() => {
    // キャンセル: どのボタンも押さない
  });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: runningLabel }).props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(mockReplaceSessionExercise).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('検索・カテゴリ絞り込みで選択済みの種目が一覧から一時的に消えても、送信すると正しく入れ替わる（絞り込み後リスト参照によるバグの回帰防止）', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });

  // 選択後に検索語を変えて、選択中の種目自体を絞り込み結果から追い出す
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('ランニング');
  });
  expect(() => root.findByProps({ accessibilityLabel: inclineBenchPressLabel })).toThrow();

  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(mockReplaceSessionExercise).toHaveBeenCalledWith(500, 11);
  expect(mockBack).toHaveBeenCalled();
});

test('入れ替えが失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  mockReplaceSessionExercise.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を入れ替えられませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('連打してもreplaceSessionExerciseは1回しか呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  let resolveSwap!: () => void;
  mockReplaceSessionExercise.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveSwap = resolve;
    }),
  );
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });
  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  act(() => {
    submitBtn.props.onPress();
    submitBtn.props.onPress();
  });

  expect(mockReplaceSessionExercise).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveSwap();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('sessionExerciseIdが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionExerciseId: 'abc',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();

  expect(root.findByProps({ children: 'トレーニングが見つかりません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockReplaceSessionExercise).not.toHaveBeenCalled();
});

test('候補が0件のときは空状態のメッセージを表示する', () => {
  mockUseExercises.mockReturnValue({ exercises: [benchPress] });
  const root = render();
  expect(root.findByProps({ children: '該当する種目がありません' })).toBeDefined();
});

test('検索語にヒットする候補が無いときは検索語を含むメッセージを表示する', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('存在しない種目');
  });
  expect(root.findByProps({ children: '「存在しない種目」は見つかりません' })).toBeDefined();
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

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

function findSortTrigger(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '));
}

test('並び替えドロップダウンが表示され、デフォルトは「よく使う順」', () => {
  const root = render();
  expect(findSortTrigger(root)!.props.accessibilityLabel).toBe('並び替え: よく使う順');
});

test('種目タブ・ピッカーとは独立した並び替え軸を持つ', () => {
  useExerciseSortStore.getState().setListSortBy('name');
  useExerciseSortStore.getState().setPickerSortBy('recent');
  const root = render();
  expect(findSortTrigger(root)!.props.accessibilityLabel).toBe('並び替え: よく使う順');
});

test('並び替えを変更すると候補一覧の並びが変わる', () => {
  mockUseExerciseUsageStats.mockReturnValue(
    new Map([
      [inclineBenchPress.id, { recentUsageCount: 1, lastUsedAt: 200 }],
      [running.id, { recentUsageCount: 10, lastUsedAt: 100 }],
    ]),
  );
  const root = render();

  act(() => {
    findSortTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, '最近使った順')!.props.onPress();
  });

  const names = root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''))
    .filter((text) => text === 'インクラインベンチプレス' || text === 'ランニング');
  // recentUsageCountはランニングの方が多いが、最近使った順に切り替えたので
  // lastUsedAtが新しいインクラインベンチプレスが先に来る
  expect(names).toEqual(['インクラインベンチプレス', 'ランニング']);
});

test('useExerciseUsageStatsに入れ替え対象セッションのsessionIdをexcludeSessionIdとして渡す（自分自身を実績として参照しないため）', () => {
  render();
  expect(mockUseExerciseUsageStats).toHaveBeenCalledWith(1);
});

test('sessionIdが不正(NaN)なときはexcludeSessionIdをundefinedで呼ぶ', () => {
  mockUseLocalSearchParams.mockReturnValue({
    sessionId: 'abc',
    sessionExerciseId: '500',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  render();
  expect(mockUseExerciseUsageStats).toHaveBeenCalledWith(undefined);
});
