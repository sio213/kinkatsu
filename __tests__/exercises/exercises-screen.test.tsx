const mockPush = jest.fn();
const mockUseExercises = jest.fn();
const mockUseExerciseUsageStats = jest.fn();
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

jest.mock('@/hooks/use-exercise-usage-stats', () => ({
  useExerciseUsageStats: () => mockUseExerciseUsageStats(),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Keyboard, Text, TextInput, TouchableOpacity } from 'react-native';
import ExercisesScreen from '@/app/(tabs)/exercises';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';

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
  mockUseExerciseUsageStats.mockReturnValue(new Map());
  // zustandのstoreはモジュールシングルトンでテスト間を跨いで共有されるため、
  // 前のテストで選んだ並び替え軸が漏れないようデフォルトへ戻す
  useExerciseSortStore.setState({ listSortBy: 'category' });
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

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('並び替えドロップダウンで「名前順」を選ぶと一覧がカテゴリ無視の50音順に並び替わる', () => {
  mockUseExercises.mockReturnValue({
    exercises: [
      { id: 1, name: 'ベンチプレス', category: 'chest' },
      { id: 2, name: 'サイドレイズ', category: 'shoulder' },
    ],
    toggleFavorite: jest.fn(),
  });
  const root = render();

  const sortTrigger = root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '))!;
  act(() => {
    sortTrigger.props.onPress();
  });
  act(() => {
    findMenuItem(root, '名前順（50音）')!.props.onPress();
  });

  const names = root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''))
    .filter((text) => text === 'ベンチプレス' || text === 'サイドレイズ');
  // 50音順なら「サイドレイズ」が「ベンチプレス」より先（カテゴリ順ならchest→shoulderで逆順になる）
  expect(names).toEqual(['サイドレイズ', 'ベンチプレス']);
});

test('カテゴリフィルタで絞り込んだ状態で並び替えを変えても、絞り込みは維持されたまま並び順だけ変わる', () => {
  mockUseExercises.mockReturnValue({
    exercises: [
      { id: 1, name: 'ベンチプレス', category: 'chest' },
      { id: 2, name: 'サイドレイズ', category: 'shoulder' },
    ],
    toggleFavorite: jest.fn(),
  });
  const root = render();

  act(() => {
    findMenuItem(root, '胸')!.props.onPress();
  });

  const namesAfterFilter = root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''))
    .filter((text) => text === 'ベンチプレス' || text === 'サイドレイズ');
  expect(namesAfterFilter).toEqual(['ベンチプレス']);

  const sortTrigger = root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '))!;
  act(() => {
    sortTrigger.props.onPress();
  });
  act(() => {
    findMenuItem(root, '名前順（50音）')!.props.onPress();
  });

  const namesAfterSort = root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''))
    .filter((text) => text === 'ベンチプレス' || text === 'サイドレイズ');
  expect(namesAfterSort).toEqual(['ベンチプレス']);
});

test('useExerciseUsageStatsの実データを反映して「よく使う順」で並び替わる', () => {
  mockUseExercises.mockReturnValue({
    exercises: [
      { id: 1, name: 'ベンチプレス', category: 'chest' },
      { id: 2, name: 'スクワット', category: 'leg' },
    ],
    toggleFavorite: jest.fn(),
  });
  mockUseExerciseUsageStats.mockReturnValue(
    new Map([
      [1, { recentUsageCount: 1, lastUsedAt: 100 }],
      [2, { recentUsageCount: 10, lastUsedAt: 200 }],
    ]),
  );
  const root = render();

  const sortTrigger = root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '))!;
  act(() => {
    sortTrigger.props.onPress();
  });
  act(() => {
    findMenuItem(root, 'よく使う順')!.props.onPress();
  });

  const names = root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''))
    .filter((text) => text === 'ベンチプレス' || text === 'スクワット');
  // スクワットの方がrecentUsageCountが多い(10>1)ので先に来る
  expect(names).toEqual(['スクワット', 'ベンチプレス']);
});
