import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SummaryChartDots } from '@/components/workout/summary-chart-dots';

const onSelect = jest.fn();

function render(total: number, currentIndex: number) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryChartDots, { total, currentIndex, onSelect }));
  });
  return instance.root;
}

function dots(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity);
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('件数ぶんのドットを出し、圧縮していなければ位置テキストは出さない', () => {
  const root = render(3, 1);

  expect(dots(root)).toHaveLength(3);
  expect(root.findAllByType(Text)).toHaveLength(0);
});

test('上限を超えたら5個に圧縮し「3/8」を併記する', () => {
  const root = render(8, 2);

  expect(dots(root)).toHaveLength(5);
  expect(root.findByType(Text).props.children).toBe('3/8');
});

// 圧縮していなければドットと種目が1対1
test('圧縮していないときは押したドットの種目へ送る', () => {
  const root = render(4, 0);

  act(() => {
    dots(root)[2].props.onPress();
  });

  expect(onSelect).toHaveBeenCalledWith(2);
});

test('表示中の種目のドットは押せない', () => {
  const root = render(4, 1);

  expect(dots(root)[1].props.disabled).toBe(true);
  expect(dots(root)[0].props.disabled).toBe(false);
});

// 圧縮時は1対1でなくなるため、光っているドットより左なら1つ戻る・右なら1つ進む
test('圧縮しているときは押した向きへ1つだけ動く', () => {
  const root = render(8, 3);

  act(() => {
    dots(root)[4].props.onPress();
  });
  expect(onSelect).toHaveBeenCalledWith(4);

  act(() => {
    dots(root)[0].props.onPress();
  });
  expect(onSelect).toHaveBeenLastCalledWith(2);
});
