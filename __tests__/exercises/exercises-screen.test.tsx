const mockPush = jest.fn();
const mockUseExercises = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercises: () => mockUseExercises(),
}));

jest.mock('@/hooks/use-keyboard-inset', () => ({
  useKeyboardInset: () => 0,
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
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
