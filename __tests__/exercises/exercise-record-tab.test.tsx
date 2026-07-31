const mockPush = jest.fn();
const mockUseExerciseProgress = jest.fn();
const mockUseWorkoutSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// グラフの系列はdb/client（expo-sqlite）に触るのでフックごと差し替える
jest.mock('@/hooks/use-exercise-progress', () => ({
  useExerciseProgress: (...args: unknown[]) => mockUseExerciseProgress(...args),
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
}));

jest.mock('@/lib/workout/session', () => ({
  startWorkoutWithExercise: jest.fn(),
  endWorkoutSession: jest.fn(),
}));

import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { ExerciseRecordTab } from '@/components/exercises/exercise-record-tab';
import type { ProgressPoint, ProgressSet } from '@/lib/exercises/progress';
import { toDayKey } from '@/lib/exercises/progress';
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

const DAY = 24 * 60 * 60 * 1000;

function makePoint(daysAgo: number, weight: number): ProgressPoint {
  const dateKey = toDayKey(Date.now() - daysAgo * DAY);
  const best: ProgressSet = {
    sessionId: daysAgo,
    workoutSessionExerciseId: daysAgo,
    setNumber: 1,
    weight,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: dateKey,
  };
  return { dateKey, startedAt: dateKey, value: weight, best, sets: [best] };
}

function render(points: ProgressPoint[]) {
  const series = {
    unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
    points,
  };
  mockUseExerciseProgress.mockReturnValue({
    series,
    // 既定は最大重量（ベスト）指標なので、選択中の系列とベスト系列は同じもの
    bestSeries: series,
    recordDays: points,
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: false,
  });
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <ExerciseRecordTab
        exerciseId={1}
        exerciseName="ベンチプレス"
        measurementType="weight_reps"
        insideTabBar={false}
      />,
    );
  });
  return instance.root;
}

const allTexts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

const pressChip = (root: ReactTestInstance, label: string) => {
  const chip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label)!;
  act(() => {
    chip.props.onPress();
  });
};

const selectPoint = (root: ReactTestInstance, index: number) => {
  const chart = root.findByType(ExerciseProgressChart);
  act(() => {
    chart.props.onSelect(index);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWorkoutSessions.mockReturnValue({ sessions: [], activeSession: null });
});

describe('ExerciseRecordTab', () => {
  // 全期間のベストは100日前の80kg。直近1ヶ月の最大は70kgで、期間チップで絞ると
  // 80kgの日はグラフから外れる
  const points = [makePoint(100, 80), makePoint(20, 70), makePoint(3, 65)];

  test('自己ベストのバッジは全期間の最大値の日にだけ出る（期間チップに連動しない）', () => {
    const root = render(points);

    // 既定の3ヶ月では80kgの日は期間外。初期選択は最新の点（65kg）なのでバッジは出ない
    expect(allTexts(root)).not.toContain('自己ベスト');

    // 期間内の最大（70kg）を選んでもベストではない。ここでフィルタ後のpointsで
    // findBestIndexしてしまうと70kgがベスト扱いになり、このテストが落ちる
    selectPoint(root, 0);
    expect(allTexts(root)).toContain('70');
    expect(allTexts(root)).not.toContain('自己ベスト');
  });

  test('グラフに渡す自己ベストも期間チップに連動しない', () => {
    const root = render(points);
    const personalBest = () => root.findByType(ExerciseProgressChart).props.highlight;

    // 既定の3ヶ月では80kgの日（100日前）は表示範囲外だが、自己ベストとしては渡り続ける
    expect(personalBest().value).toBe(80);
    expect(root.findByType(ExerciseProgressChart).props.points).toHaveLength(2);

    pressChip(root, '1ヶ月');
    expect(personalBest().value).toBe(80);

    pressChip(root, '全期間');
    expect(personalBest().value).toBe(80);
  });

  test('全期間に切り替えて80kgの日を選ぶと自己ベストのバッジが出る', () => {
    const root = render(points);
    pressChip(root, '全期間');

    selectPoint(root, 0);
    expect(allTexts(root)).toContain('80');
    expect(allTexts(root)).toContain('自己ベスト');
  });

  describe('グラフの読み上げ', () => {
    // グラフはSVGなので、チップやアンバーの点は読み上げに乗らない。コンテナのラベルが頼り。
    // 幅はonLayoutで自分で測る作りなので、読む前に一度レイアウトを流す
    const chartLabel = (root: ReactTestInstance) => {
      const container = root.findAll((n) => n.props.accessibilityRole === 'image')[0];
      act(() => {
        container.props.onLayout({ nativeEvent: { layout: { width: 353 } } });
      });
      return root.findAll((n) => n.props.accessibilityRole === 'image')[0].props
        .accessibilityLabel as string;
    };

    test('自己ベストの点を選んでいれば「自己ベスト」と読み上げる', () => {
      const root = render(points);
      pressChip(root, '全期間');
      selectPoint(root, 0);
      expect(chartLabel(root)).toContain('自己ベスト');
    });

    test('自己ベストでない点を選んでいるときは言わない', () => {
      const root = render(points);
      pressChip(root, '全期間');
      selectPoint(root, 1);
      expect(chartLabel(root)).not.toContain('自己ベスト');
    });

    test('自己ベストが表示期間の外にあることを、選択と関係なく伝える', () => {
      const root = render(points);
      pressChip(root, '1ヶ月');
      // 晴眼者にはチップの文字で見えている情報が、読み上げから消えないようにする
      expect(chartLabel(root)).toContain('自己ベストは表示期間の外');
      expect(chartLabel(root)).toContain('80kg');
    });
  });
});

describe('指標の切り替え', () => {
  const points = [makePoint(40, 60), makePoint(20, 70), makePoint(3, 65)];

  // フックは「渡された指標で組んだ系列」を返す。ここでは best と total の2系列を用意し、
  // 呼び出し時の引数に応じて出し分ける（本物のフックと同じ契約）
  const renderWithMetrics = (chartMeasurementType = 'weight_reps') => {
    const bestSeries = {
      unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
      points,
    };
    const totalSeries = {
      unit: { label: 'kg', step: 100, minRange: 200, integerOnly: false, auxKind: 'none' },
      points: points.map((p) => ({ ...p, value: p.value * 24 })),
    };
    mockUseExerciseProgress.mockImplementation((_id, _type, metric) => ({
      series: metric === 'total' ? totalSeries : bestSeries,
      bestSeries,
      recordDays: points,
      chartMeasurementType,
      metric,
      loaded: true,
      failed: false,
    }));
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <ExerciseRecordTab
          exerciseId={1}
          exerciseName="ベンチプレス"
          measurementType="weight_reps"
          insideTabBar={false}
        />,
      );
    });
    return instance.root;
  };

  test('計測タイプに応じたチップが出る', () => {
    const root = renderWithMetrics();
    const labels = root
      .findAllByType(TouchableOpacity)
      .map((t) => t.props.accessibilityLabel as string);
    expect(labels).toEqual(expect.arrayContaining(['最大重量', '総重量', '推定1RM']));
  });

  test('加重ホールド系は選べる指標が1つなのでチップ列を出さない', () => {
    const root = renderWithMetrics('weight_time');
    const labels = root
      .findAllByType(TouchableOpacity)
      .map((t) => t.props.accessibilityLabel as string);
    expect(labels).not.toContain('最大重量');
  });

  test('総重量に切り替えるとハイライトの意味が変わり、内訳カードに値行が出る', () => {
    const root = renderWithMetrics();
    expect(root.findByType(ExerciseProgressChart).props.highlightKind).toBe('personal-best');

    pressChip(root, '総重量');

    expect(root.findByType(ExerciseProgressChart).props.highlightKind).toBe('metric-max');
    // 「最大○○」では値行を出さないが、総重量では出す（FIX-13）
    expect(allTexts(root)).toContain('総重量');
    expect(allTexts(root)).toContain('1,560');
  });

  test('推定1RMを選んだときだけ注記が出る', () => {
    const root = renderWithMetrics();
    const hasCaption = () => allTexts(root).some((t) => t.includes('実測ではありません'));
    expect(hasCaption()).toBe(false);

    pressChip(root, '推定1RM');
    expect(hasCaption()).toBe(true);

    pressChip(root, '最大重量');
    expect(hasCaption()).toBe(false);
  });

  test('指標を切り替えても選択していた日は変わらない', () => {
    const root = renderWithMetrics();
    pressChip(root, '全期間');
    selectPoint(root, 0);
    const before = root.findByType(ExerciseProgressChart).props.selectedIndex;

    pressChip(root, '総重量');
    expect(root.findByType(ExerciseProgressChart).props.selectedIndex).toBe(before);
  });
});
