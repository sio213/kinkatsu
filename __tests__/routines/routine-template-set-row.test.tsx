import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TextInput, TouchableOpacity } from 'react-native';
import { RoutineTemplateSetRow } from '@/components/routines/routine-template-set-row';

function render(props: Partial<Parameters<typeof RoutineTemplateSetRow>[0]> = {}) {
  const merged: Parameters<typeof RoutineTemplateSetRow>[0] = {
    setNumber: 1,
    values: { weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    measurementType: 'weight_reps',
    exerciseName: 'ベンチプレス',
    onChange: jest.fn(),
    onDelete: jest.fn(),
    ...props,
  };
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<RoutineTemplateSetRow {...merged} />);
  });
  return instance.root;
}

test('初期値がセルに表示される', () => {
  const root = render({ values: { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null } });
  const inputs = root.findAllByType(TextInput);
  expect(inputs[0].props.value).toBe('60');
  expect(inputs[1].props.value).toBe('8');
});

test('入力するたびにonChangeへパース済みの値が渡る（✓確定ステップ無し）', () => {
  const onChange = jest.fn();
  const root = render({ onChange });
  const inputs = root.findAllByType(TextInput);

  act(() => {
    inputs[0].props.onChangeText('62.5');
  });
  expect(onChange).toHaveBeenLastCalledWith({ weight: 62.5, reps: null, durationSeconds: null, distanceMeters: null });

  act(() => {
    inputs[1].props.onChangeText('10');
  });
  expect(onChange).toHaveBeenLastCalledWith({ weight: 62.5, reps: 10, durationSeconds: null, distanceMeters: null });
});

test('不正なパース不能値の入力中は直前の値にフォールバックする（nullで上書きしない）', () => {
  const onChange = jest.fn();
  const root = render({ values: { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }, onChange });
  const inputs = root.findAllByType(TextInput);

  act(() => {
    inputs[0].props.onChangeText('62.');
  });
  expect(onChange).toHaveBeenLastCalledWith({ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null });
});

test('✕を押すとonDeleteが呼ばれる', () => {
  const onDelete = jest.fn();
  const root = render({ onDelete });
  const deleteBtn = root
    .findAllByType(TouchableOpacity)
    .find((b: ReactTestInstance) => (b.props.accessibilityLabel as string)?.includes('削除'))!;

  act(() => {
    deleteBtn.props.onPress();
  });
  expect(onDelete).toHaveBeenCalled();
});
