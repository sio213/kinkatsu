// 種目1つ分の「過去の記録」画面。3つの状態（取得失敗／読み込み中／0件）と一覧表示の
// 出し分けが本体で、特に次の2点は意図的にそうしてあるので固定する。
//   - 一覧は series ではなく recordDays を使う（加重種目を加重なしでやった日も並べる）
//   - カードの計測タイプは生の measurementType ではなく chartMeasurementType を渡す
//     （重量を1度も記録していない加重種目は reps 種目として値を組むため）
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDebouncedPush = jest.fn();
const mockUseExercise = jest.fn();
const mockUseExerciseProgress = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: '1' }),
  // Stack.Screen はナビゲーターのoptionsを設定するだけだが、headerTitle の中身を
  // 検証できるようレンダー関数を実行してやる
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockDebouncedPush,
}));

jest.mock('@/hooks/use-exercises', () => ({
  useExercise: (...args: unknown[]) => mockUseExercise(...args),
}));

jest.mock('@/hooks/use-exercise-progress', () => ({
  useExerciseProgress: (...args: unknown[]) => mockUseExerciseProgress(...args),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SectionList, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Exercise } from '@/db/schema';
import { ExerciseRecordCard } from '@/components/exercises/exercise-record-card';
import { ExerciseHistoryScreen } from '@/components/exercises/exercise-history-screen';

const TEST_SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date('2026-07-01T03:00:00Z').getTime();

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: 'ベンチプレス',
    slug: null,
    category: 'chest',
    favorite: false,
    note: null,
    formPoints: null,
    source: 'custom',
    measurementType: 'weight_reps',
    pairedWeights: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePoint(dateKey: number, startedAt: number, value: number) {
  return {
    dateKey,
    startedAt,
    value,
    best: {
      sessionId: dateKey,
      workoutSessionExerciseId: dateKey,
      setNumber: 1,
      weight: value,
      reps: 10,
      durationSeconds: null,
      distanceMeters: null,
      completedAt: startedAt,
    },
    sets: [],
  };
}

const UNIT = { label: 'kg', step: 5, minRange: 10, integerOnly: false, auxKind: 'reps' };

function setProgress(
  overrides: Partial<{
    series: unknown;
    recordDays: unknown[];
    chartMeasurementType: string;
    loaded: boolean;
    failed: boolean;
  }> = {},
) {
  mockUseExerciseProgress.mockReturnValue({
    series: { unit: UNIT, points: [] },
    bestSeries: { unit: UNIT, points: [] },
    recordDays: [],
    chartMeasurementType: 'weight_reps',
    metric: 'best',
    loaded: true,
    failed: false,
    ...overrides,
  });
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat();
}

// SectionList は react-test-renderer 上では行を実際に描かない（仮想化されるため）。
// renderItem を直接呼び、行に渡っている props を見る。renderItem は ListErrorBoundary で
// 1段包んだ要素を返すので、その子の ExerciseRecordCard を取り出す
function renderCard(root: ReactTestInstance, item: unknown) {
  const element = root.findByType(SectionList).props.renderItem({ item }) as {
    props: { children: { type: unknown; props: Record<string, any> } };
  };
  expect(element.props.children.type).toBe(ExerciseRecordCard);
  return element.props.children;
}

function render(insideTabBar = false) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(
        SafeAreaProvider,
        { initialMetrics: TEST_SAFE_AREA_METRICS },
        React.createElement(ExerciseHistoryScreen, { insideTabBar }),
      ),
    );
  });
  return instance.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseExercise.mockReturnValue({ exercise: makeExercise(), loaded: true });
  setProgress();
});

describe('ExerciseHistoryScreen の状態出し分け', () => {
  it('取得に失敗したら、空状態ではなく読み込み失敗を出す', () => {
    setProgress({ failed: true });

    const root = render();

    expect(allTexts(root)).toContain('記録を読み込めませんでした');
    expect(root.findAllByType(SectionList)).toHaveLength(0);
  });

  it('読み込み中は一覧も空状態も描かない（0件がフラッシュしないように）', () => {
    setProgress({ loaded: false });

    const root = render();

    expect(allTexts(root)).not.toContain('この種目の記録がまだありません');
    expect(root.findAllByType(SectionList)).toHaveLength(0);
  });

  it('種目の読み込みが終わっていない間も一覧を描かない', () => {
    mockUseExercise.mockReturnValue({ exercise: undefined, loaded: false });

    const root = render();

    expect(root.findAllByType(SectionList)).toHaveLength(0);
  });

  it('記録が0件なら空状態を出し、戻るで前の画面へ帰す', () => {
    const root = render();

    expect(allTexts(root)).toContain('この種目の記録がまだありません');
    const back = root
      .findAllByType(TouchableOpacity)
      .find((b) => allTexts(b).includes('戻る'));
    act(() => back!.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('ExerciseHistoryScreen の一覧', () => {
  it('recordDays を新しい順に並べ、月見出しで区切って全件出す', () => {
    setProgress({
      recordDays: [makePoint(20260701, BASE, 60), makePoint(20260801, BASE + 31 * DAY, 70)],
    });

    const root = render();
    const list = root.findByType(SectionList);
    const points = list.props.sections.flatMap((s: { data: unknown[] }) => s.data);

    expect(points.map((p: { value: number }) => p.value)).toEqual([70, 60]);
    expect(allTexts(root)).toContain(2);
  });

  it('カードには chartMeasurementType を渡す（生の measurementType ではない）', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ measurementType: 'weight_reps' }),
      loaded: true,
    });
    const point = makePoint(20260701, BASE, 12);
    setProgress({ recordDays: [point], chartMeasurementType: 'reps' });

    const card = renderCard(render(), point);

    expect(card.props.measurementType).toBe('reps');
  });

  it('自己ベストの日のカードにだけ isBest を立てる', () => {
    const older = makePoint(20260701, BASE, 60);
    const best = makePoint(20260801, BASE + 31 * DAY, 70);
    setProgress({
      recordDays: [older, best],
      series: { unit: UNIT, points: [older, best] },
    });

    const root = render();

    expect(renderCard(root, best).props.isBest).toBe(true);
    expect(renderCard(root, older).props.isBest).toBe(false);
  });

  it('カードをタップするとそのセッションの詳細へ遷移する', () => {
    const point = makePoint(20260701, BASE, 60);
    setProgress({ recordDays: [point] });

    const card = renderCard(render(), point);
    act(() => card.props.onPress(99));

    expect(mockDebouncedPush).toHaveBeenCalledWith('/workout/99');
  });

  it('ヘッダーには種目名をサブタイトルとして出す', () => {
    setProgress({ recordDays: [makePoint(20260701, BASE, 60)] });

    expect(allTexts(render())).toContain('ベンチプレス');
  });

  it('pairedWeights はグラフを使わない画面でも渡す（総重量が半分になるのを防ぐため）', () => {
    mockUseExercise.mockReturnValue({
      exercise: makeExercise({ pairedWeights: true }),
      loaded: true,
    });

    render();

    expect(mockUseExerciseProgress).toHaveBeenCalledWith(1, 'weight_reps', 'best', true);
  });
});
