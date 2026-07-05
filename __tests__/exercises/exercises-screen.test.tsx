const mockPush = jest.fn();
const mockUseExercises = jest.fn();
let focusEffectCleanup: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  // 実際のuseFocusEffectはナビゲーションのフォーカス/ブラーイベントに紐づくが、
  // テストではeffectを即実行し、返ってきたクリーンアップ関数（ブラー時の処理）を
  // 外から手動で呼べるようにして「画面がフォーカスを失った」を模擬する
  useFocusEffect: (effect: () => (() => void) | void) => {
    focusEffectCleanup = effect() ?? undefined;
  },
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Keyboard, Text, TextInput, TouchableOpacity } from 'react-native';
import ExercisesScreen from '@/app/(tabs)/exercises';

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn
        .findAllByType(Text)
        .some((t: ReactTestInstance) => [t.props.children].flat().join('') === label),
    );
}

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExercisesScreen));
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  focusEffectCleanup = undefined;
  mockUseExercises.mockReturnValue({ exercises: [], toggleFavorite: jest.fn() });
});

test('「＋ 追加」ボタンで名前を空にして/exercise/newへ遷移する', () => {
  const root = render();

  const addBtn = findButtonByLabel(root, '＋ 追加')!;
  act(() => {
    addBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/exercise/new', params: { name: '' } });
});

test('空状態の「＋ 最初の種目を追加」ボタンで名前を空にして/exercise/newへ遷移する', () => {
  const root = render();

  const emptyAddBtn = findButtonByLabel(root, '＋ 最初の種目を追加')!;
  act(() => {
    emptyAddBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/exercise/new', params: { name: '' } });
});

test('検索語がある状態の空状態CTAは、検索語をnameに載せて/exercise/newへ遷移する', () => {
  const root = render();

  const searchInput = root.findByType(TextInput);
  act(() => {
    searchInput.props.onChangeText('スクワット');
  });

  const emptyAddBtn = findButtonByLabel(root, '＋ スクワットを追加')!;
  act(() => {
    emptyAddBtn.props.onPress();
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/exercise/new',
    params: { name: 'スクワット' },
  });
});

test('画面がフォーカスを失うとキーボードが閉じる（検索欄にフォーカスが残ったまま詳細画面から戻ってくる不具合の対策）', () => {
  const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  render();

  expect(focusEffectCleanup).toBeDefined();
  expect(dismissSpy).not.toHaveBeenCalled();

  // 詳細画面へ遷移する等でこの画面がフォーカスを失ったことを模擬する
  act(() => {
    focusEffectCleanup?.();
  });

  expect(dismissSpy).toHaveBeenCalledTimes(1);
});
