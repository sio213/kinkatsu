import { ExerciseSortDropdown } from '@/components/exercises/exercise-sort-dropdown';
import type { ExerciseSortBy } from '@/lib/exercises/constants';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Modal, Text, TouchableOpacity } from 'react-native';

function render(sortBy: ExerciseSortBy, onChange: (sortBy: ExerciseSortBy) => void) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<ExerciseSortDropdown sortBy={sortBy} onChange={onChange} />);
  });
  return instance.root;
}

// トリガー自身も内部にラベルTextを持つため、accessibilityLabelの完全一致で区別する
// （session-exercise-card.test.tsxの⋮メニューテストと同じ理由）
function findTrigger(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((t) => (t.props.accessibilityLabel as string)?.startsWith('並び替え: '));
}

function findMenuItem(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
}

test('現在選択中のラベルがトリガーに表示される', () => {
  const root = render('category', jest.fn());
  const trigger = findTrigger(root)!;
  expect(trigger.findAllByType(Text).some((t) => [t.props.children].flat().join('') === '並び替え: カテゴリ順')).toBe(
    true,
  );
});

test('トリガーを押すまで選択肢は表示されない', () => {
  const root = render('category', jest.fn());
  expect(findMenuItem(root, 'よく使う順')).toBeUndefined();
});

test('トリガーを押すと4つの選択肢が表示される', () => {
  const root = render('category', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  expect(findMenuItem(root, '名前順（50音）')).toBeDefined();
  expect(findMenuItem(root, 'カテゴリ順')).toBeDefined();
  expect(findMenuItem(root, 'よく使う順')).toBeDefined();
  expect(findMenuItem(root, '最近使った順')).toBeDefined();
});

test('選択肢を選ぶとonChangeが呼ばれ、メニューが閉じる', () => {
  const onChange = jest.fn();
  const root = render('category', onChange);
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, 'よく使う順')!.props.onPress();
  });

  expect(onChange).toHaveBeenCalledWith('frequent');
  expect(findMenuItem(root, '名前順（50音）')).toBeUndefined();
});

test('現在選択中と同じ項目を選んでもonChangeは呼ばれない', () => {
  const onChange = jest.fn();
  const root = render('category', onChange);
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  act(() => {
    findMenuItem(root, 'カテゴリ順')!.props.onPress();
  });

  expect(onChange).not.toHaveBeenCalled();
});

test('選択中の項目にはaccessibilityState.checked=trueが付く', () => {
  const root = render('frequent', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  expect(findMenuItem(root, 'よく使う順')!.props.accessibilityState).toEqual({ checked: true });
  expect(findMenuItem(root, '名前順（50音）')!.props.accessibilityState).toEqual({ checked: false });
});

test('選択肢はaccessibilityRole=radio（単一選択であることを示す）', () => {
  const root = render('category', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  expect(findMenuItem(root, 'カテゴリ順')!.props.accessibilityRole).toBe('radio');
});

test('トリガーのaccessibilityState.expandedが開閉で切り替わる', () => {
  const root = render('category', jest.fn());
  expect(findTrigger(root)!.props.accessibilityState).toEqual({ expanded: false });
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  expect(findTrigger(root)!.props.accessibilityState).toEqual({ expanded: true });
});

test('背景（Modal外側）を押すとメニューが閉じる', () => {
  const root = render('category', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  expect(findMenuItem(root, 'よく使う順')).toBeDefined();

  const backdrop = root.findByProps({ testID: 'exercise-sort-dropdown-backdrop' });
  act(() => {
    backdrop.props.onPress();
  });

  expect(findMenuItem(root, 'よく使う順')).toBeUndefined();
  expect(findTrigger(root)!.props.accessibilityState).toEqual({ expanded: false });
});

test('Androidバックボタン相当（ModalのonRequestClose）でもメニューが閉じる', () => {
  const root = render('category', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });

  act(() => {
    root.findByType(Modal).props.onRequestClose();
  });

  expect(findMenuItem(root, 'よく使う順')).toBeUndefined();
});

test('選択肢は「よく使う順・最近使った順」→「名前順・カテゴリ順」の順で並ぶ', () => {
  const root = render('category', jest.fn());
  act(() => {
    findTrigger(root)!.props.onPress();
  });
  const labels = root
    .findAllByType(TouchableOpacity)
    .map((t) => t.props.accessibilityLabel as string)
    .filter((label) => label !== '並び替え: カテゴリ順');
  expect(labels).toEqual(['よく使う順', '最近使った順', '名前順（50音）', 'カテゴリ順']);
});
