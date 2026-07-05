const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseExercises = jest.fn();
const mockUseSessionExercises = jest.fn();
const mockAddExercisesToSession = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // 実際のuseFocusEffectはナビゲーションのフォーカス/ブラーイベントに紐づくが、
  // テストではeffectを即実行するだけで十分（クリーンアップの検証はここでは不要）
  useFocusEffect: (effect: () => (() => void) | void) => {
    effect();
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useSessionExercises: (...args: unknown[]) => mockUseSessionExercises(...args),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

jest.mock('@/lib/workout/session', () => ({
  addExercisesToSession: (...args: unknown[]) => mockAddExercisesToSession(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import ExercisePickerScreen from '@/app/workout/exercise-picker';

const benchPress = { id: 10, name: 'ベンチプレス', category: 'chest', favorite: false, source: 'preset' };
const squat = { id: 11, name: 'スクワット', category: 'leg', favorite: false, source: 'preset' };
const benchPressLabel = 'ベンチプレス、胸';
const squatLabel = 'スクワット、脚';

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
    instance = create(React.createElement(ExercisePickerScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ sessionId: '5' });
  mockUseExercises.mockReturnValue({ exercises: [benchPress, squat] });
  mockUseSessionExercises.mockReturnValue([]);
  mockAddExercisesToSession.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('初期状態は未選択で「追加」ボタンは無効', () => {
  const root = render();
  const addBtn = findButtonByLabel(root, '追加')!;
  expect(addBtn.props.disabled).toBe(true);
});

test('種目をタップすると選択され、ボタンラベルが件数付きに変わる', () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: benchPressLabel });
  act(() => {
    row.props.onPress();
  });

  expect(findButtonByLabel(root, '1件を追加')).toBeDefined();
});

test('選択済みの種目を再度タップすると解除され、0件で追加ボタンが再び無効化される', () => {
  const root = render();
  const row = root.findByProps({ accessibilityLabel: benchPressLabel });

  act(() => {
    row.props.onPress();
  });
  expect(findButtonByLabel(root, '1件を追加')).toBeDefined();

  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '追加')!;
  expect(addBtn.props.disabled).toBe(true);
});

test('複数選択して追加を押すとaddExercisesToSessionが呼ばれ、router.backする', async () => {
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
    root.findByProps({ accessibilityLabel: squatLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '2件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(mockAddExercisesToSession).toHaveBeenCalledWith(5, [10, 11]);
  expect(mockBack).toHaveBeenCalled();
});

test('追加が失敗した場合はエラーAlertを表示し、router.backは呼ばれない', async () => {
  mockAddExercisesToSession.mockRejectedValueOnce(new Error('fail'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('エラー', '種目を追加できませんでした。');
  expect(mockBack).not.toHaveBeenCalled();
});

test('追加ボタンを連打してもaddExercisesToSessionは1回しか呼ばれない', async () => {
  let resolveAdd!: () => void;
  mockAddExercisesToSession.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveAdd = resolve;
    }),
  );
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  act(() => {
    addBtn.props.onPress();
    addBtn.props.onPress();
  });

  expect(mockAddExercisesToSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAdd();
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('sessionIdが不正(NaN)な場合、追加を押しても何も起きない', async () => {
  mockUseLocalSearchParams.mockReturnValue({ sessionId: 'abc' });
  const root = render();
  act(() => {
    root.findByProps({ accessibilityLabel: benchPressLabel }).props.onPress();
  });

  const addBtn = findButtonByLabel(root, '1件を追加')!;
  await act(async () => {
    addBtn.props.onPress();
  });

  expect(mockAddExercisesToSession).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('既にセッションに追加済みの種目は候補一覧に出ない（二重追加防止）', () => {
  mockUseSessionExercises.mockReturnValue([{ ...benchPress, orderIndex: 0 }]);
  const root = render();

  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();
  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
});

test('ⓘボタンを押すと種目詳細へ遷移する', () => {
  const root = render();
  const infoButtons = root
    .findAllByType(TouchableOpacity)
    .filter((btn: ReactTestInstance) => btn.props.accessibilityLabel === 'ベンチプレスの詳細を見る');
  expect(infoButtons.length).toBe(1);

  act(() => {
    infoButtons[0].props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith('/exercise/10');
});

test('検索するとカテゴリ・名前に一致しない種目は絞り込まれる', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('スクワット');
  });

  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();
});

test('検索語が無いときの空状態は「該当する種目がありません」', () => {
  mockUseExercises.mockReturnValue({ exercises: [] });
  const root = render();
  expect(root.findByProps({ children: '該当する種目がありません' })).toBeDefined();
});

test('検索語があるときの空状態は検索語を含むメッセージになる', () => {
  const root = render();
  const searchInput = root.findAllByType(TextInput)[0];
  act(() => {
    searchInput.props.onChangeText('存在しない種目');
  });

  expect(root.findByProps({ children: '「存在しない種目」は見つかりません' })).toBeDefined();
});

test('カテゴリチップで絞り込むと該当カテゴリ以外の種目は表示されない', () => {
  const root = render();
  const legChip = root.findByProps({ accessibilityLabel: '脚' });
  act(() => {
    legChip.props.onPress();
  });

  expect(root.findByProps({ accessibilityLabel: squatLabel })).toBeDefined();
  expect(() => root.findByProps({ accessibilityLabel: benchPressLabel })).toThrow();
});
