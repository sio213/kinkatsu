const mockUseExerciseProgress = jest.fn();

jest.mock('@/hooks/use-exercise-progress', () => ({
  useExerciseProgress: (...args: unknown[]) => mockUseExerciseProgress(...args),
}));

// グラフ本体は種目詳細で検証済み。ここでは種目の切り替えとどの種目を渡したかだけを見たいので、
// 描画をラベルに置き換えて中身の再描画コストとSVG依存を外す
jest.mock('@/components/exercises/exercise-progress-chart', () => ({
  ExerciseProgressChart: () => {
    const { Text } = require('react-native');
    const { createElement } = require('react');
    return createElement(Text, null, 'グラフ');
  },
}));

// ジェスチャ検出は素通しにする（スワイプの判定自体はRNGH側の責務）
jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const chain: Record<string, () => unknown> = {};
      for (const key of ['runOnJS', 'activeOffsetX', 'failOffsetY', 'onEnd']) chain[key] = () => chain;
      return chain;
    },
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SummaryExerciseChart } from '@/components/workout/summary-exercise-chart';

const EXERCISES = [
  { exerciseId: 1, name: 'ベンチプレス', measurementType: 'weight_reps', pairedWeights: false },
  { exerciseId: 2, name: 'ダンベルフライ', measurementType: 'weight_reps', pairedWeights: true },
  { exerciseId: 3, name: 'ディップス', measurementType: 'reps', pairedWeights: false },
];

function render(exercises = EXERCISES) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryExerciseChart, { exercises }));
  });
  return instance.root;
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) =>
      [t.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''),
    )
    .filter((s) => s.length > 0);
}

function press(root: ReactTestInstance, label: string) {
  act(() => {
    root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label)!.props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseExerciseProgress.mockReturnValue({
    series: { points: [{ dateKey: 1, value: 100 }], unit: { label: 'kg' } },
    bestSeries: { points: [] },
    recordDays: [{ dateKey: 1 }],
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: false,
  });
});

test('最初は1種目目のグラフを出す', () => {
  const root = render();

  expect(texts(root)).toContain('ベンチプレス');
  expect(mockUseExerciseProgress).toHaveBeenCalledWith(1, 'weight_reps', 'best', false);
});

test('次へで種目が切り替わり、その種目の系列を引き直す', () => {
  const root = render();

  press(root, '次の種目');

  expect(texts(root)).toContain('ダンベルフライ');
  // 左右2つ分を扱う種目かどうかもそのまま渡す（総重量の倍率に効く）
  expect(mockUseExerciseProgress).toHaveBeenLastCalledWith(2, 'weight_reps', 'best', true);
});

test('前へで1つ戻る', () => {
  const root = render();

  press(root, '次の種目');
  press(root, '前の種目');

  expect(texts(root)).toContain('ベンチプレス');
});

// 種目が1件だけのセッションでも同じ形で描く（送りは両方とも無効）
test('種目が1件でもグラフを出す', () => {
  const root = render([EXERCISES[0]]);

  expect(texts(root)).toContain('ベンチプレス');
  expect(texts(root)).toContain('グラフ');
});

test('種目が0件なら何も描かない', () => {
  const root = render([]);

  expect(texts(root)).toHaveLength(0);
});

// ✓を付けずに終えた種目はここに来る。種目詳細のような見本グラフ＋CTAは出さない
test('記録が0件の種目ではグラフの代わりに理由を出す', () => {
  mockUseExerciseProgress.mockReturnValue({
    series: { points: [], unit: { label: 'kg' } },
    bestSeries: { points: [] },
    recordDays: [],
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: false,
  });

  const root = render();

  expect(texts(root)).toContain('まだ記録がありません');
  expect(texts(root)).not.toContain('グラフ');
});

test('取得に失敗したら理由を出す', () => {
  mockUseExerciseProgress.mockReturnValue({
    series: { points: [], unit: { label: 'kg' } },
    bestSeries: { points: [] },
    recordDays: [],
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: true,
  });

  const root = render();

  expect(texts(root)).toContain('記録を読み込めませんでした');
});

// useLiveQueryはdeps変更後も前回のdataを保持するため、keyでマウントし直さないと
// 切り替え直後に前の種目の系列が描かれ続ける
test('種目を切り替えるとグラフが作り直される（前の種目の系列を描き続けない）', () => {
  const root = render();
  const before = root.findAllByType(Text).length;

  press(root, '次の種目');

  // 新しい種目のidでフックが呼ばれ直していること（keyによる再マウントの結果）
  expect(mockUseExerciseProgress).toHaveBeenLastCalledWith(2, 'weight_reps', 'best', true);
  expect(root.findAllByType(Text).length).toBe(before);
});

// 種目が減って添字が範囲外になっても壊れない（記録編集で種目を消して戻ってきた場合）
test('表示中より種目が減ったら最後の種目に寄せる', () => {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryExerciseChart, { exercises: EXERCISES }));
  });
  act(() => {
    instance.root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === '次の種目')!
      .props.onPress();
  });
  act(() => {
    instance.update(
      React.createElement(SummaryExerciseChart, { exercises: [EXERCISES[0]] }),
    );
  });

  expect(texts(instance.root)).toContain('ベンチプレス');
});
