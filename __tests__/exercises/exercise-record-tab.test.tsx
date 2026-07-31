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
        pairedWeights={false}
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
  const renderWithMetrics = (chartMeasurementType = 'weight_reps', pairedWeights = false) => {
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
          pairedWeights={pairedWeights}
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

  // 内訳カードのセット行は片手の重量（10kg）のまま、総重量だけが2倍になる。その食い違いを
  // 説明する注記なので、総重量を選んでいるときにだけ出す
  const hasPairedNote = (root: ReactTestInstance) =>
    allTexts(root).some((t) => t.includes('左右2つ分の合計です'));

  // 内訳カードのラベルに添える補足。注記がスクロールで視野から外れても、
  // 2倍の数字のすぐ隣に理由が残る
  const hasCardNote = (root: ReactTestInstance) => allTexts(root).some((t) => t.includes('(左右合計)'));

  test('左右2つ分の種目で総重量を選んだときだけ、数え方の注記が出る', () => {
    const root = renderWithMetrics('weight_reps', true);
    expect(hasPairedNote(root)).toBe(false);
    expect(hasCardNote(root)).toBe(false);

    pressChip(root, '総重量');
    expect(hasPairedNote(root)).toBe(true);
    // グラフ下の注記と内訳カードの補足は同じ条件で出入りする
    expect(hasCardNote(root)).toBe(true);

    // 最大重量・推定1RMは片手の値のまま。ここに出すと逆に誤解させる
    pressChip(root, '推定1RM');
    expect(hasPairedNote(root)).toBe(false);
    expect(hasCardNote(root)).toBe(false);
    pressChip(root, '最大重量');
    expect(hasPairedNote(root)).toBe(false);
    expect(hasCardNote(root)).toBe(false);
  });

  test('注記の例は条件ではなく例示だと分かる形にする', () => {
    const root = renderWithMetrics('weight_reps', true);
    pressChip(root, '総重量');
    // 「10kg×10回のときだけ2倍」と条件に読まれないよう「例:」を伴わせる
    expect(allTexts(root).some((t) => t.includes('（例: 10kg×10回なら200kg）'))).toBe(true);
  });

  test('左右2つ分でない種目では総重量を選んでも注記を出さない', () => {
    const root = renderWithMetrics('weight_reps', false);
    pressChip(root, '総重量');
    expect(hasPairedNote(root)).toBe(false);
    expect(hasCardNote(root)).toBe(false);
  });

  test('pairedWeightsはフックへそのまま渡す。ここが抜けると系列だけ倍にならない', () => {
    renderWithMetrics('weight_reps', true);
    expect(mockUseExerciseProgress).toHaveBeenCalledWith(1, 'weight_reps', 'best', true);
  });

  test('総重量の点が1つも無い期間では、数え方の注記より「記録がありません」を優先する', () => {
    const bestSeries = {
      unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
      points,
    };
    const emptySeries = { unit: bestSeries.unit, points: [] as ProgressPoint[] };
    mockUseExerciseProgress.mockImplementation((_id, _type, metric) => ({
      series: metric === 'total' ? emptySeries : bestSeries,
      bestSeries,
      recordDays: points,
      chartMeasurementType: 'weight_reps',
      metric,
      loaded: true,
      failed: false,
    }));
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <ExerciseRecordTab
          exerciseId={1}
          exerciseName="ダンベルベンチプレス"
          measurementType="weight_reps"
          pairedWeights
          insideTabBar={false}
        />,
      );
    });
    const root = instance.root;
    pressChip(root, '総重量');

    // 2倍になった数字がどこにも見えていないので、数え方だけ説明しても手がかりにならない
    expect(hasPairedNote(root)).toBe(false);
    expect(allTexts(root).some((t) => t.includes('記録がありません'))).toBe(true);
  });

  test('重量を1度も入れておらず回数種目として描いている種目では注記を出さない', () => {
    // 合計チップの中身が「合計回数」に変わる。回数は左右で2倍にならない
    const root = renderWithMetrics('reps', true);
    pressChip(root, '合計回数');
    expect(hasPairedNote(root)).toBe(false);
  });

  test('推定1RMを選んだときだけ注記が出る', () => {
    const root = renderWithMetrics();
    const hasCaption = () => allTexts(root).some((t) => t.includes('1回だけ挙げられる重量'));
    expect(hasCaption()).toBe(false);

    pressChip(root, '推定1RM');
    expect(hasCaption()).toBe(true);

    pressChip(root, '最大重量');
    expect(hasCaption()).toBe(false);
  });

  test('推定1RMの点が1つも無くても、グラフ・チップ・過去の記録は消さない', () => {
    const bestSeries = {
      unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
      points: [makePoint(20, 40), makePoint(3, 45)],
    };
    // 全日15回以上の種目。推定1RMは算出対象のセットが無く0点になる
    const emptySeries = { unit: bestSeries.unit, points: [] as ProgressPoint[] };
    mockUseExerciseProgress.mockImplementation((_id, _type, metric) => ({
      series: metric === 'e1rm' ? emptySeries : bestSeries,
      bestSeries,
      recordDays: bestSeries.points,
      chartMeasurementType: 'weight_reps',
      metric,
      loaded: true,
      failed: false,
    }));
    let instance!: ReturnType<typeof create>;
    act(() => {
      instance = create(
        <ExerciseRecordTab
          exerciseId={1}
          exerciseName="レッグカール"
          measurementType="weight_reps"
          pairedWeights={false}
          insideTabBar={false}
        />,
      );
    });
    const root = instance.root;
    pressChip(root, '推定1RM');

    // 見本グラフに差し替えず、枠だけのグラフを残す
    expect(root.findAllByType(ExerciseProgressChart)).toHaveLength(1);
    expect(root.findByType(ExerciseProgressChart).props.points).toEqual([]);
    // 理由は他の注記と同じ形で出す
    expect(allTexts(root).some((t) => t.includes('回を超えるセットは誤差が大きいため'))).toBe(true);
    // 過去の記録は消さない
    expect(allTexts(root)).toContain('過去の記録');
  });

  test('自重の日の注記は、表示中の期間に抜けがあるときだけ出す', () => {
    const bestSeries = {
      unit: { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' },
      // グラフに出るのは直近2件だけ。40日前の自重の日は点にできず落ちている
      points: [makePoint(20, 70), makePoint(3, 65)],
    };
    mockUseExerciseProgress.mockReturnValue({
      series: bestSeries,
      bestSeries,
      // 一覧には40日前の自重の日も残っている
      recordDays: [makePoint(40, 0), makePoint(20, 70), makePoint(3, 65)],
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
          exerciseName="加重ディップス"
          measurementType="weight_reps"
          pairedWeights={false}
          insideTabBar={false}
        />,
      );
    });
    const root = instance.root;
    const hasNote = () => allTexts(root).some((t) => t.includes('加重量が無いので点を出しません'));

    // 既定の3ヶ月には40日前が入るので、画面上に抜けがある
    expect(hasNote()).toBe(true);

    // 1ヶ月に絞ると自重の日は期間の外。抜けが見えないので注記も出さない
    pressChip(root, '1ヶ月');
    expect(hasNote()).toBe(false);

    pressChip(root, '全期間');
    expect(hasNote()).toBe(true);
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
