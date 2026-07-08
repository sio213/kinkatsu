import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { HistoryLoadExerciseCard } from '@/components/workout/history-load-exercise-card';
import type { SessionHistoryCard } from '@/lib/workout/history';

const baseCard: SessionHistoryCard = {
  workoutSessionExerciseId: 500,
  exerciseId: 10,
  name: 'ベンチプレス',
  category: 'chest',
  measurementType: 'weight_reps',
  source: 'preset',
  slug: 'bench_press',
  sets: [
    { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 },
    { setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 },
  ],
};

function render(card: SessionHistoryCard = baseCard, selected = false) {
  const onToggle = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<HistoryLoadExerciseCard card={card} selected={selected} onToggle={onToggle} />);
  });
  return { root: instance.root, onToggle };
}

test('種目名・カテゴリ・セット要約を表示する', () => {
  const { root } = render();
  expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  expect(root.findByProps({ children: '胸' })).toBeDefined();
  expect(root.findByProps({ children: '60kg×10・60kg×8' })).toBeDefined();
});

test('accessibilityLabelに種目名・カテゴリ・セット要約をまとめる', () => {
  const { root } = render();
  expect(root.findByProps({ accessibilityLabel: 'ベンチプレス、胸、60kg×10・60kg×8' })).toBeDefined();
});

test('selected状態がaccessibilityStateに反映される', () => {
  const { root } = render(baseCard, true);
  const row = root.findByType(TouchableOpacity);
  expect(row.props.accessibilityState).toEqual({ checked: true });
});

test('タップするとworkoutSessionExerciseIdを渡してonToggleを呼ぶ', () => {
  const { root, onToggle } = render();
  act(() => {
    root.findByType(TouchableOpacity).props.onPress();
  });
  expect(onToggle).toHaveBeenCalledWith(500);
});

test('未知のmeasurementTypeでもクラッシュせず標準の重量×回数表示にフォールバックする', () => {
  const card: SessionHistoryCard = { ...baseCard, measurementType: 'legacy_unknown' };
  const { root } = render(card);
  expect(root.findByProps({ children: '60kg×10・60kg×8' })).toBeDefined();
});

test('reps計測タイプでは単位付き(n回)で要約する', () => {
  const card: SessionHistoryCard = {
    ...baseCard,
    measurementType: 'reps',
    sets: [{ setNumber: 1, weight: null, reps: 15, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
  };
  const { root } = render(card);
  expect(root.findByProps({ children: '15回' })).toBeDefined();
});
