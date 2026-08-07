import { RoutineDiffSetRow } from '@/components/routines/routine-diff-set-row';
import type { MeasurementType } from '@/lib/exercises/constants';
import type { DiffSet } from '@/lib/routines/diff';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

function values(weight: number | null, reps: number | null) {
  return { weight, reps, durationSeconds: null, distanceMeters: null };
}

let currentInstance: ReturnType<typeof create> | undefined;

function render(diff: DiffSet, measurementType: MeasurementType = 'weight_reps', checked = true) {
  const onToggle = jest.fn();
  act(() => {
    currentInstance = create(
      <RoutineDiffSetRow diff={diff} measurementType={measurementType} checked={checked} onToggle={onToggle} />,
    );
  });
  return { root: currentInstance!.root, onToggle };
}

afterEach(() => {
  act(() => {
    currentInstance?.unmount();
  });
  currentInstance = undefined;
});

function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().filter((c) => typeof c === 'string').join(''))
    .filter((s) => s.length > 0);
}

function row(root: ReactTestInstance) {
  return root.findAllByType(TouchableOpacity)[0];
}

const changed: DiffSet = { setNumber: 1, kind: 'changed', before: values(95, 5), after: values(100, 5) };
const added: DiffSet = { setNumber: 4, kind: 'added', before: null, after: values(90, 8) };
const removed: DiffSet = { setNumber: 3, kind: 'removed', before: values(50, 10), after: null };

test('変更は「変更前 → 変更後」を並べる', () => {
  const { root } = render(changed);

  expect(texts(root)).toEqual(['1セット目', '95kg×5', '100kg×5']);
  expect(row(root).props.accessibilityLabel).toBe('1セット目 95kg×5 から 100kg×5 へ変更');
});

// 追加・削除は値の比較ができないので、種別をチップで示す
test('追加は変更前を出さず「追加」チップを添える', () => {
  const { root } = render(added);

  expect(texts(root)).toEqual(['4セット目', '90kg×8', '追加']);
  expect(row(root).props.accessibilityLabel).toBe('4セット目 90kg×8 を追加');
});

test('削除は変更前だけを出して「削除」チップを添える', () => {
  const { root } = render(removed);

  // ラベルは幅68固定の独立した要素（矢印の位置を縦に揃えるため）
  expect(texts(root)).toEqual(['3セット目', '50kg×10', '削除']);
  expect(row(root).props.accessibilityLabel).toBe('3セット目 50kg×10 を削除');
});

test('計測タイプに応じた表記になる', () => {
  const timeDiff: DiffSet = {
    setNumber: 1,
    kind: 'changed',
    before: { weight: null, reps: null, durationSeconds: 60, distanceMeters: null },
    after: { weight: null, reps: null, durationSeconds: 90, distanceMeters: null },
  };
  const { root } = render(timeDiff, 'time');

  expect(texts(root)).toEqual(['1セット目', '1:00', '1:30']);
});

test('チェック状態を読み上げに乗せ、行全体でトグルする', () => {
  const { root, onToggle } = render(changed, 'weight_reps', false);

  expect(row(root).props.accessibilityState).toEqual({ checked: false });
  act(() => {
    row(root).props.onPress();
  });
  expect(onToggle).toHaveBeenCalledWith(1);
});

// 「追加した種目」「未実施の種目」の内訳。チェックボックスの場所は空けたまま、
// 値と種別チップは「値の変更」の行と同じ組み立てにする
test('readOnlyではチェックボックスもタップも無いが、値とチップは同じに出る', () => {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(<RoutineDiffSetRow diff={added} measurementType="weight_reps" readOnly />);
  });
  currentInstance = instance;
  const root = instance.root;

  expect(texts(root)).toEqual(['4セット目', '90kg×8', '追加']);
  expect(root.findAllByType(TouchableOpacity)).toHaveLength(0);
});
