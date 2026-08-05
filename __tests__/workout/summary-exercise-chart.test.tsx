const mockUseExerciseProgress = jest.fn();

jest.mock('@/hooks/use-exercise-progress', () => ({
  useExerciseProgress: (...args: unknown[]) => mockUseExerciseProgress(...args),
}));

// グラフ本体は種目詳細で検証済み。ここでは種目の切り替えとどの種目を渡したかだけを見たいので、
// 描画をラベルに置き換えて中身の再描画コストとSVG依存を外す
jest.mock('@/components/exercises/exercise-progress-chart', () => ({
  ExerciseProgressChart: (props: { scrubbable?: boolean }) => {
    const { Text } = require('react-native');
    const { createElement } = require('react');
    return createElement(Text, { testID: 'chart', ...props }, 'グラフ');
  },
}));

// ジェスチャ検出は素通しにする（スワイプの判定自体はRNGH側の責務）。
// onEndのハンドラだけは捕まえて、テストからスワイプ確定を模擬できるようにする
/* eslint-disable no-var */
var mockPanHandlers: { onEnd?: (event: { translationX: number; velocityX: number }) => void };

jest.mock('react-native-gesture-handler', () => {
  mockPanHandlers = {};
  return {
    Gesture: {
      Pan: () => {
        const chain: Record<string, (arg?: unknown) => unknown> = {};
        for (const key of ['runOnJS', 'activeOffsetX', 'failOffsetY', 'onUpdate']) {
          chain[key] = () => chain;
        }
        chain.onEnd = (fn?: unknown) => {
          mockPanHandlers.onEnd = fn as typeof mockPanHandlers.onEnd;
          return chain;
        };
        return chain;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

// withTimingのスナップ完了コールバックを捕まえ、テストから任意のタイミングで発火させる
// （__tests__/calendar/swipeable-month-view-gesture.test.tsx と同じ手法）
var mockTimingCalls: { toValue: number; callback?: (finished: boolean) => void }[];

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  mockTimingCalls = [];
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (toValue: number, _config: unknown, callback?: (finished: boolean) => void) => {
      mockTimingCalls.push({ toValue, callback });
      return toValue;
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { CHART_HEIGHT } from '@/lib/exercises/chart-layout';
import { SummaryExerciseChart } from '@/components/workout/summary-exercise-chart';

const EXERCISES = [
  { exerciseId: 1, name: 'ベンチプレス', measurementType: 'weight_reps', pairedWeights: false },
  { exerciseId: 2, name: 'ダンベルフライ', measurementType: 'weight_reps', pairedWeights: true },
  { exerciseId: 3, name: 'ディップス', measurementType: 'reps', pairedWeights: false },
];

const CONTAINER_WIDTH = 350;

/** トラックは幅が測れるまで描かれないので、onLayoutを流してから返す */
function render(exercises = EXERCISES) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryExerciseChart, { exercises, horizontalInset: 16 }));
  });
  layout(instance.root);
  return instance.root;
}

function layout(root: ReactTestInstance) {
  const viewport = root.findAll((n) => typeof n.props.onLayout === 'function')[0];
  if (!viewport) return;
  act(() => {
    viewport.props.onLayout({ nativeEvent: { layout: { width: CONTAINER_WIDTH } } });
  });
}

/** 送り操作はスナップし切ってから確定するので、テストからアニメーション完了を発火させる */
function flushSnap() {
  const snap = mockTimingCalls.at(-1);
  act(() => {
    snap?.callback?.(true);
  });
}

/** スワイプを離した瞬間を模擬し、スナップが完了したことにする */
function swipe({ translationX, velocityX = 0 }: { translationX: number; velocityX?: number }) {
  act(() => {
    mockPanHandlers.onEnd?.({ translationX, velocityX });
  });
  flushSnap();
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) =>
      [t.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''),
    )
    .filter((s) => s.length > 0);
}

/** トラックを収める枠の高さ。注記の行を確保しているかどうかがここに出る */
function viewportHeight(root: ReactTestInstance): number {
  const viewport = root.findAll((n) => typeof n.props.onLayout === 'function')[0];
  return StyleSheet.flatten(viewport.props.style).height;
}

function press(root: ReactTestInstance, label: string) {
  act(() => {
    root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label)!.props.onPress();
  });
  flushSnap();
}

/** フックを呼んだコンポーネントがマウントされた順の種目id。再マウントの検出に使う */
const mounted: number[] = [];

const PROGRESS_RESULT = {
  series: { points: [{ dateKey: 1, value: 100 }], unit: { label: 'kg' } },
  bestSeries: { points: [] },
  recordDays: [{ dateKey: 1 }],
  chartMeasurementType: 'weight_reps',
  metric: 'best',
  loaded: true,
  failed: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTimingCalls.length = 0;
  mounted.length = 0;
  mockUseExerciseProgress.mockImplementation((exerciseId: number) => {
    // フックはグラフ1枚につき1つ。マウント時だけ記録することで、送ったときに
    // 既存のグラフが作り直されていないかを見る
    React.useEffect(() => {
      mounted.push(exerciseId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return PROGRESS_RESULT;
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
  expect(mockUseExerciseProgress).toHaveBeenCalledWith(2, 'weight_reps', 'best', true);
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

// ✓を付けずに終えた種目はここに来る。見本には差し替えず、実物のグラフを点が無い状態で描き、
// なぜ点が無いのかを注記で説明する（@ユーザー指摘）
test('記録が0件でも実物のグラフを描き、点が無い理由を注記で出す', () => {
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

  // 見本に差し替えず、実物のグラフ（モックが'グラフ'を描く）をそのまま描く
  expect(texts(root)).toContain('グラフ');
  // 点が無い理由はグラフ下の注記で伝える（種目詳細の「自重の日＝…」と同じ形）
  expect(texts(root)).toContain('記録なし＝');
  expect(texts(root)).toContain('まだ✓を付けたセットがありません');
});

// グラフがブロックの過半を占めるため、ここが横ドラッグを握っていると種目送りの
// 当たり判定が全体の1〜2割しか残らない。点の選択はタップで残す
test('グラフのスクラブを切って、横ドラッグを種目送りへ明け渡す', () => {
  const root = render();

  for (const chart of root.findAllByProps({ testID: 'chart' })) {
    expect(chart.props.scrubbable).toBe(false);
  }
});

test('記録がある種目では注記を出さない', () => {
  const root = render();

  expect(texts(root)).not.toContain('記録なし＝');
});

// 常時確保にすると、全種目に記録がある通常のセッションでグラフとドットの間に空の行が
// 挟まったままになる（デザイン案の8pxが29pxになる）
test('全種目に記録があれば注記の行を確保しない', () => {
  const root = render();

  expect(viewportHeight(root)).toBe(CHART_HEIGHT);
});

// 出る種目と出ない種目で高さが変わると、送るたびに下の一覧が上下する。セッション単位で揃える
test('記録0件の種目が1つでもあれば、全種目ぶん注記の行を確保する', () => {
  mockUseExerciseProgress.mockImplementation((exerciseId: number) => {
    React.useEffect(() => {
      mounted.push(exerciseId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // 2種目目だけ記録0件
    return exerciseId === 2 ? { ...PROGRESS_RESULT, recordDays: [] } : PROGRESS_RESULT;
  });

  const root = render();

  expect(viewportHeight(root)).toBeGreaterThan(CHART_HEIGHT);
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

// useLiveQueryはdeps変更後も前回のdataを保持するため、種目ごとにkeyでマウントし直さないと
// 切り替え直後に前の種目の系列が描かれ続ける。各グラフが自分のidでフックを呼ぶことで担保する
test('グラフは種目ごとに別々の系列を引く（前の種目のものを描き続けない）', () => {
  render();

  const ids = mockUseExerciseProgress.mock.calls.map((c) => c[0]);
  expect(new Set(ids)).toEqual(new Set([1, 2, 3]));
});

// 送った先の種目がその瞬間に初めてマウントされると、系列の取得が終わるまで「読み込み中」
// ＝白い枠が見える。連続で送るほど当たりやすかった（@ユーザー報告）ので、
// 全種目を最初に載せて一度もアンマウントしない
test('全種目を最初にマウントし、送っても作り直さない', () => {
  const root = render();
  expect(mounted).toEqual([1, 2, 3]);

  press(root, '次の種目');
  press(root, '次の種目');
  press(root, '前の種目');

  // 送っても増えない＝どのグラフも作り直されていない
  expect(mounted).toEqual([1, 2, 3]);
});

// カレンダーの月送りと同じ3スロットのトラック。指を離した位置と速度で送るか戻すかを決める
test('十分な距離のスワイプで次の種目へ送る', () => {
  const root = render();

  swipe({ translationX: -80 });

  expect(texts(root)).toContain('ダンベルフライ');
});

test('速いフリックなら距離が足りなくても送る', () => {
  const root = render();

  swipe({ translationX: -20, velocityX: -1200 });

  expect(texts(root)).toContain('ダンベルフライ');
});

test('距離も速度も足りなければ元の種目へ戻す', () => {
  const root = render();

  swipe({ translationX: -20, velocityX: -100 });

  expect(texts(root)).toContain('ベンチプレス');
});

// 送りボタンが無効になっているのと同じ扱い。端では送らずに元の位置へ戻す
test('先頭で右へスワイプしても送らない', () => {
  const root = render();

  swipe({ translationX: 120 });

  expect(texts(root)).toContain('ベンチプレス');
});

test('末尾で左へスワイプしても送らない', () => {
  const root = render([EXERCISES[0]]);

  swipe({ translationX: -120 });

  expect(texts(root)).toContain('ベンチプレス');
});

// 種目が減って添字が範囲外になっても壊れない（記録編集で種目を消して戻ってきた場合）
test('表示中より種目が減ったら最後の種目に寄せる', () => {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(SummaryExerciseChart, { exercises: EXERCISES, horizontalInset: 16 }));
  });
  act(() => {
    instance.root
      .findAllByType(TouchableOpacity)
      .find((b) => b.props.accessibilityLabel === '次の種目')!
      .props.onPress();
  });
  act(() => {
    instance.update(
      React.createElement(SummaryExerciseChart, { exercises: [EXERCISES[0]], horizontalInset: 16 }),
    );
  });

  expect(texts(instance.root)).toContain('ベンチプレス');
});
