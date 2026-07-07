import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { HistoryEntryCard } from '@/components/workout/history-entry-card';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import type { HistoryEntry } from '@/lib/workout/history';

const entry: HistoryEntry = {
  workoutSessionExerciseId: 100,
  startedAt: new Date('2026-07-01T10:00:00').getTime(),
  sets: [
    { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 },
    { setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 },
  ],
};

function render(props: Partial<React.ComponentProps<typeof HistoryEntryCard>> = {}) {
  const onLoad = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <HistoryEntryCard
        entry={entry}
        columns={MEASUREMENT_COLUMNS.weight_reps}
        isBest={false}
        disabled={false}
        loading={false}
        onLoad={onLoad}
        {...props}
      />,
    );
  });
  return { root: instance.root, onLoad };
}

test('日付・要約を表示し、自己ベストでなければバッジは表示しない', () => {
  const { root } = render();
  expect(root.findByProps({ children: '7月1日（水）' })).toBeDefined();
  expect(root.findByProps({ children: '60kg×10・60kg×8' })).toBeDefined();
  expect(() => root.findByProps({ children: '自己ベスト' })).toThrow();
});

test('isBestがtrueなら自己ベストバッジを表示する', () => {
  const { root } = render({ isBest: true });
  expect(root.findByProps({ children: '自己ベスト' })).toBeDefined();
});

test('日付・相対日付・自己ベスト・要約を1つの読み上げ単位（accessibilityLabel）にまとめる', () => {
  const { root } = render({ isBest: true });
  const infoView = root.findByProps({
    accessible: true,
    accessibilityLabel: '7月1日（水）、自己ベスト、60kg×10・60kg×8',
  });
  expect(infoView).toBeDefined();
});

test('読み込みボタンはentryを渡してonLoadを呼ぶ', () => {
  const { root, onLoad } = render();
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  act(() => {
    loadBtn.props.onPress();
  });
  expect(onLoad).toHaveBeenCalledWith(entry);
});

test('disabledがtrueならボタンが無効化される', () => {
  const { root } = render({ disabled: true });
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  expect(loadBtn.props.disabled).toBe(true);
  expect(loadBtn.props.accessibilityState).toEqual({ disabled: true, busy: false });
});

test('loadingがtrueならダウンロードアイコンの代わりにActivityIndicatorを表示する', () => {
  const { root } = render({ loading: true, disabled: true });
  const loadBtn = root.findByProps({ accessibilityLabel: '7月1日（水）の記録を読み込む' });
  expect(loadBtn.findAllByType(ActivityIndicator).length).toBe(1);
  expect(loadBtn.props.accessibilityState).toEqual({ disabled: true, busy: true });
});

test('読み込むボタンのラベルテキストは常に表示される', () => {
  const { root } = render();
  expect(root.findAllByType(TouchableOpacity)[0].findAllByType(Text).some((t) => t.props.children === '読み込む')).toBe(
    true,
  );
});
