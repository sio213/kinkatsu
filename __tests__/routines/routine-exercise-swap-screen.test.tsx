const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockReplaceExerciseAt = jest.fn();
const mockUseExerciseUsageStats = jest.fn();
const mockBuildInitialRoutineSets = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
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

jest.mock('@/lib/routines/draft-store', () => ({
  useRoutineDraftStore: (selector: (state: { replaceExerciseAt: (...args: unknown[]) => void }) => unknown) =>
    selector({ replaceExerciseAt: mockReplaceExerciseAt }),
}));

jest.mock('@/lib/routines/db', () => ({
  buildInitialRoutineSets: (...args: unknown[]) => mockBuildInitialRoutineSets(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import RoutineExerciseSwapScreen from '@/app/routine/exercise-swap';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';

const benchPress = {
  id: 10,
  name: 'ベンチプレス',
  category: 'chest',
  favorite: false,
  source: 'preset',
  measurementType: 'weight_reps',
  slug: 'bench_press',
};
const inclineBenchPress = {
  id: 11,
  name: 'インクラインベンチプレス',
  category: 'chest',
  favorite: false,
  source: 'preset',
  measurementType: 'weight_reps',
  slug: 'incline_bench_press',
};
const running = {
  id: 12,
  name: 'ランニング',
  category: 'cardio',
  favorite: false,
  source: 'preset',
  measurementType: 'distance_time',
  slug: 'running',
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
    instance = create(React.createElement(RoutineExerciseSwapScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'true',
  });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, inclineBenchPress, running] });
  mockUseExerciseUsageStats.mockReturnValue(new Map());
  mockBuildInitialRoutineSets.mockResolvedValue([
    { weight: 40, reps: 12, durationSeconds: null, distanceMeters: null },
  ]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

test('検索・カテゴリ絞り込みで選択済みの種目が一覧から一時的に消えても、送信すると正しく入れ替わる（絞り込み後リスト参照によるバグの回帰防止）', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: inclineBenchPressLabel }).props.onPress();
  });

  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('ランニング');
  });
  expect(() => root.findByProps({ accessibilityLabel: inclineBenchPressLabel })).toThrow();

  const submitBtn = findButtonByLabel(root, '入れ替える')!;
  await act(async () => {
    submitBtn.props.onPress();
  });

  expect(mockReplaceExerciseAt).toHaveBeenCalledWith(2, expect.objectContaining({ exerciseId: 11 }));
  expect(mockBack).toHaveBeenCalled();
});

test('検索語にヒットする候補が無いときは検索語を含むメッセージを表示する', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('存在しない種目');
  });
  expect(root.findByProps({ children: '「存在しない種目」は見つかりません' })).toBeDefined();
});

test('記録済みデータが無ければ、確認なしですぐbuildInitialRoutineSets→replaceExerciseAtが呼ばれ、router.backする', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
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
  expect(mockBuildInitialRoutineSets).toHaveBeenCalledWith(11);
  expect(mockReplaceExerciseAt).toHaveBeenCalledWith(2, {
    exerciseId: 11,
    name: 'インクラインベンチプレス',
    category: 'chest',
    measurementType: 'weight_reps',
    source: 'preset',
    slug: 'incline_bench_press',
    sets: [{ weight: 40, reps: 12, durationSeconds: null, distanceMeters: null }],
  });
  expect(mockBack).toHaveBeenCalled();
});

test('記録済みデータがあれば、選んだ種目名を含む確認ダイアログを出し、確定するとreplaceExerciseAtが呼ばれる', async () => {
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
    '設定済みのセット内容は失われます。',
    expect.anything(),
  );
  expect(mockReplaceExerciseAt).toHaveBeenCalledWith(2, expect.objectContaining({ exerciseId: 11 }));
  expect(mockBack).toHaveBeenCalled();
});

test('確認をキャンセルするとreplaceExerciseAtは呼ばれない', async () => {
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

  expect(mockReplaceExerciseAt).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('入れ替えが失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  mockBuildInitialRoutineSets.mockRejectedValueOnce(new Error('fail'));
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

test('連打してもbuildInitialRoutineSetsは1回しか呼ばれない', async () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: '2',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  let resolveSwap!: (v: unknown) => void;
  mockBuildInitialRoutineSets.mockReturnValue(
    new Promise((resolve) => {
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

  expect(mockBuildInitialRoutineSets).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveSwap([]);
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('indexが不正(NaN)な場合は「見つかりません」画面になり、戻るとrouter.backが呼ばれる', () => {
  mockUseLocalSearchParams.mockReturnValue({
    index: 'abc',
    currentExerciseId: '10',
    currentExerciseName: 'ベンチプレス',
    hasRecordedData: 'false',
  });
  const root = render();

  expect(root.findByProps({ children: '種目が見つかりません' })).toBeDefined();

  const backBtn = findButtonByLabel(root, '戻る')!;
  act(() => {
    backBtn.props.onPress();
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mockReplaceExerciseAt).not.toHaveBeenCalled();
});

test('候補が0件のときは空状態のメッセージを表示する', () => {
  mockUseExercises.mockReturnValue({ exercises: [benchPress] });
  const root = render();
  expect(root.findByProps({ children: '該当する種目がありません' })).toBeDefined();
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

test('useExerciseUsageStatsはexcludeSessionId無しで呼ばれる(ルーティン編集には進行中セッションが無いため)', () => {
  render();
  expect(mockUseExerciseUsageStats).toHaveBeenCalledWith();
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
  expect(names).toEqual(['インクラインベンチプレス', 'ランニング']);
});
