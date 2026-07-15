import { RoutinePickerCard } from '@/components/routines/routine-picker-card';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function render(props: Partial<React.ComponentProps<typeof RoutinePickerCard>> = {}) {
  const onPress = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <RoutinePickerCard name="胸トレ" exerciseCount={3} categories={['chest']} onPress={onPress} {...props} />,
    );
  });
  return { root: instance.root, onPress };
}

test('名前・種目数・カテゴリチップを表示する', () => {
  const { root } = render();
  expect(root.findByProps({ children: '胸トレ' })).toBeDefined();
  expect(root.findByProps({ children: '胸' })).toBeDefined();
});

test('カード全体が1つの読み上げ単位（accessibilityLabel）にまとまる', () => {
  const { root } = render();
  expect(root.findByProps({ accessibilityLabel: '胸トレ、胸、3種目' })).toBeDefined();
});

test('カテゴリが無い場合はaccessibilityLabelにカテゴリ部分を含めない', () => {
  const { root } = render({ categories: [] });
  expect(root.findByProps({ accessibilityLabel: '胸トレ、3種目' })).toBeDefined();
});

test('カードをタップするとonPressを呼ぶ', () => {
  const { root, onPress } = render();
  act(() => {
    root.findByType(TouchableOpacity).props.onPress();
  });
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('右端に遷移を示すchevronを表示する（開始ボタン・⋮メニューは持たない）', () => {
  const { root } = render();
  expect(root.findAllByType(Text).some((t) => t.props.children === '›')).toBe(true);
  // RoutineCardと違い開始ボタン・⋮メニューは持たない読み取り専用カードのため、
  // タップ可能なTouchableOpacityはカード全体1つだけのはず
  expect(root.findAllByType(TouchableOpacity)).toHaveLength(1);
});

test('カテゴリが多い場合は省略件数を「+N」で表示する（summarizeCategoriesの既存仕様）', () => {
  const { root } = render({ categories: ['chest', 'back', 'shoulder', 'arm', 'leg'] });
  expect(root.findAllByType(Text).some((t) => typeof t.props.children === 'string' && t.props.children.startsWith('+'))).toBe(
    true,
  );
});
