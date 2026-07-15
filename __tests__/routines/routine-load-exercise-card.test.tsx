import { RoutineLoadExerciseCard } from '@/components/routines/routine-load-exercise-card';
import type { RoutineDetailExercise } from '@/lib/routines/db';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

const baseExercise: RoutineDetailExercise = {
  id: 501,
  routineId: 1,
  exerciseId: 10,
  orderIndex: 0,
  createdAt: 0,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
  sets: [
    { id: 1, routineExerciseId: 501, setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, createdAt: 0 },
    { id: 2, routineExerciseId: 501, setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, createdAt: 0 },
  ],
};

function render(exercise: RoutineDetailExercise = baseExercise, selected = false) {
  const onToggle = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<RoutineLoadExerciseCard exercise={exercise} selected={selected} onToggle={onToggle} />);
  });
  return { root: instance.root, onToggle };
}

test('種目名・カテゴリ・目標セット要約を表示する', () => {
  const { root } = render();
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(root.findByProps({ children: '胸' })).toBeDefined();
  expect(root.findByProps({ children: '60kg×10・60kg×8' })).toBeDefined();
});

test('accessibilityLabelは目標値であることが伝わるよう「目標」を前置きする', () => {
  const { root } = render();
  expect(root.findByProps({ accessibilityLabel: 'ベンチプレス、胸、目標60kg×10・60kg×8' })).toBeDefined();
});

test('selected状態がaccessibilityStateに反映される', () => {
  const { root } = render(baseExercise, true);
  const row = root.findByType(TouchableOpacity);
  expect(row.props.accessibilityState).toEqual({ checked: true });
});

test('タップするとroutineExerciseId(exercise.id)を渡してonToggleを呼ぶ', () => {
  const { root, onToggle } = render();
  act(() => {
    root.findByType(TouchableOpacity).props.onPress();
  });
  expect(onToggle).toHaveBeenCalledWith(501);
});

// ルーティンは目標値を未入力のまま保存できるため、種目に紐づく全セットが空(全カラムnull)の
// 場合がありうる。formatHistorySetSummaryはそのようなセットを要約から除外し空文字列を返すため、
// 素の空白行に見えないようプレースホルダーを出す(designerレビュー対応)
test('目標セットが全カラムnullで要約が空文字列になる場合、プレースホルダー文言を表示する', () => {
  const exercise: RoutineDetailExercise = {
    ...baseExercise,
    sets: [{ id: 1, routineExerciseId: 501, setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null, createdAt: 0 }],
  };
  const { root } = render(exercise);
  expect(root.findByProps({ children: '目標値未設定' })).toBeDefined();
  expect(root.findByProps({ accessibilityLabel: 'ベンチプレス、胸、目標目標値未設定' })).toBeDefined();
});

test('目標セットが0件の場合もプレースホルダー文言を表示する(要約が空文字列になる別経路)', () => {
  const exercise: RoutineDetailExercise = { ...baseExercise, sets: [] };
  const { root } = render(exercise);
  expect(root.findByProps({ children: '目標値未設定' })).toBeDefined();
});
