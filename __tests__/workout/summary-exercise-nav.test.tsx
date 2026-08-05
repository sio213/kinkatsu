import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SummaryExerciseNav } from '@/components/workout/summary-exercise-nav';

const onPrev = jest.fn();
const onNext = jest.fn();

function render(props: { hasPrev: boolean; hasNext: boolean; name?: string }) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(SummaryExerciseNav, {
        name: props.name ?? 'ベンチプレス',
        onPrev,
        onNext,
        hasPrev: props.hasPrev,
        hasNext: props.hasNext,
      }),
    );
  });
  return instance.root;
}

function button(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label)!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('種目名を表示し、送りボタンで前後に切り替える', () => {
  const root = render({ hasPrev: true, hasNext: true });

  expect(root.findByType(Text).props.children).toBe('ベンチプレス');
  act(() => {
    button(root, '次の種目').props.onPress();
  });
  expect(onNext).toHaveBeenCalled();
  act(() => {
    button(root, '前の種目').props.onPress();
  });
  expect(onPrev).toHaveBeenCalled();
});

// 端に達したことを、位置テキストではなく押せるかどうかで伝える（ループさせない）
test('1件目では前へ、最後では次へが無効になる', () => {
  const first = render({ hasPrev: false, hasNext: true });
  expect(button(first, '前の種目').props.accessibilityState).toEqual({ disabled: true });
  expect(button(first, '次の種目').props.accessibilityState).toEqual({ disabled: false });

  const last = render({ hasPrev: true, hasNext: false });
  expect(button(last, '次の種目').props.accessibilityState).toEqual({ disabled: true });
});

test('1件だけなら両方とも無効になる', () => {
  const root = render({ hasPrev: false, hasNext: false });

  expect(button(root, '前の種目').props.accessibilityState).toEqual({ disabled: true });
  expect(button(root, '次の種目').props.accessibilityState).toEqual({ disabled: true });
});

// ボタン自体は30×30しかないため、hitSlopで44pt以上のタップ判定を確保する
test('送りボタンは44pt相当のタップ判定を持つ', () => {
  const root = render({ hasPrev: true, hasNext: true });

  expect(button(root, '前の種目').props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
});
