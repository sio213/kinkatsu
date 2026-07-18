const mockPush = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockUseCalendarDayExercises = jest.fn();
const mockSwipeableMonthView = jest.fn();

jest.mock('@/hooks/use-debounced-push', () => ({
  useDebouncedPush: () => mockPush,
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

jest.mock('@/hooks/use-workout-session', () => ({
  useWorkoutSessions: () => mockUseWorkoutSessions(),
}));

jest.mock('@/hooks/use-calendar-day-exercises', () => ({
  useCalendarDayExercises: () => mockUseCalendarDayExercises(),
}));

jest.mock('@/hooks/use-calendar-month-records', () => ({
  useCalendarMonthRecords: () => ({ primaryCategoryByDay: new Map(), categorySetByDay: new Map() }),
}));

// 日付選択UI自体（スワイプ・グリッド）はmonth-grid.test.tsx等の責務のため、
// このテストでは「今日・記録なし」パネルの配線だけを見たいので軽量スタブに差し替える。
// mockSwipeableMonthViewでpropsを記録し、activeFilter等が正しく中継されることも検証できるようにする
jest.mock('@/components/calendar/swipeable-month-view', () => ({
  SwipeableMonthView: (props: unknown) => {
    mockSwipeableMonthView(props);
    return null;
  },
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import CalendarScreen from '@/app/(tabs)/calendar';

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(CalendarScreen));
  });
  return instance.root;
}

// {value}文言のように複数の子要素に分割されるJSXは、findByPropsの単一文字列一致では
// 見つからないため、childrenを結合してから比較する（他のスクリーンテストと同じ手法）
function findTextByJoinedChildren(root: ReactTestInstance, text: string) {
  return root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
  mockUseWorkoutSessions.mockReturnValue({ sessions: [], activeSession: null });
});

describe('CalendarScreen 今日・記録なしパネル', () => {
  test('進行中セッションが無ければ「トレーニングを開始」ボタンを表示し、押すとstart-chooserへ遷移する', () => {
    const root = render();
    const btnText = root.findByProps({ children: 'トレーニングを開始' });
    expect(btnText).toBeDefined();

    const btn = root
      .findAllByType(TouchableOpacity)
      .find((t) => t.props.accessibilityLabel === 'トレーニングを開始')!;
    act(() => {
      btn.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/workout/start-chooser');
  });

  test('進行中セッションがあれば「トレーニングを開始」ではなく再開バナーを表示し、押すとそのセッションへ直接遷移する（start-chooserは経由しない）', () => {
    mockUseWorkoutSessions.mockReturnValue({
      sessions: [{ id: 9, startedAt: 0, endedAt: null }],
      activeSession: { id: 9, startedAt: 0, endedAt: null },
    });
    const root = render();

    expect(root.findAllByProps({ children: 'トレーニングを開始' }).length).toBe(0);
    const resumeBtn = root
      .findAllByType(TouchableOpacity)
      .find((t) => t.props.accessibilityLabel === '進行中のトレーニングを再開する')!;
    act(() => {
      resumeBtn.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/workout/9');
    expect(mockPush).not.toHaveBeenCalledWith('/workout/start-chooser');
  });

  test('cards===errorのときはボタンではなくエラーUIを表示する', () => {
    mockUseCalendarDayExercises.mockReturnValue({ cards: 'error', retry: jest.fn() });
    const root = render();
    expect(root.findAllByProps({ children: 'トレーニングを開始' }).length).toBe(0);
    expect(root.findByProps({ children: '記録を読み込めませんでした' })).toBeDefined();
  });

  test('cards===null(読み込み中)のときはボタンを表示しない', () => {
    mockUseCalendarDayExercises.mockReturnValue({ cards: null, retry: jest.fn() });
    const root = render();
    expect(root.findAllByProps({ children: 'トレーニングを開始' }).length).toBe(0);
  });
});

describe('CalendarScreen カテゴリフィルター', () => {
  function card(overrides: Record<string, unknown> = {}) {
    return {
      workoutSessionExerciseId: 1,
      exerciseId: 1,
      name: 'ベンチプレス',
      category: 'chest',
      measurementType: 'weight_reps',
      source: 'preset',
      slug: 'bench-press',
      sessionId: 1,
      isBest: false,
      comparison: null,
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
      ...overrides,
    };
  }

  test('デフォルトは「全て」で、全カードが表示される', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ workoutSessionExerciseId: 1, category: 'chest' }), card({ workoutSessionExerciseId: 2, category: 'leg', name: 'スクワット' })],
      retry: jest.fn(),
    });
    const root = render();
    expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
    expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
  });

  test('カテゴリチップを選ぶと、選択日パネルも該当カテゴリの種目だけに絞られる', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ workoutSessionExerciseId: 1, category: 'chest' }), card({ workoutSessionExerciseId: 2, category: 'leg', name: 'スクワット' })],
      retry: jest.fn(),
    });
    const root = render();

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });

    expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
    expect(root.findAllByProps({ children: 'スクワット' }).length).toBe(0);
  });

  test('記録はあるが選択中のカテゴリに該当するものが無い日は「(カテゴリ)の記録はありません」を表示する', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ workoutSessionExerciseId: 1, category: 'leg', name: 'スクワット' })],
      retry: jest.fn(),
    });
    const root = render();

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });

    expect(findTextByJoinedChildren(root, '胸の記録はありません')).toBeDefined();
  });

  test('見出しにフィルター中であることを示すバッジが付く', () => {
    mockUseCalendarDayExercises.mockReturnValue({ cards: [card()], retry: jest.fn() });
    const root = render();

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });

    expect(findTextByJoinedChildren(root, ' （胸で絞り込み中）')).toBeDefined();
  });

  test('その日に記録が全く無い場合、フィルター中でも「(カテゴリ)の記録はありません」ではなく通常の空状態を表示する', () => {
    mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
    const root = render();

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });

    expect(findTextByJoinedChildren(root, '胸の記録はありません')).toBeUndefined();
    // 今日選択中・進行中セッション無しなので通常の開始ボタンが出る
    expect(root.findByProps({ children: 'トレーニングを開始' })).toBeDefined();
    // 記録が無い日にフィルターバッジを出す意味は薄く誤読を招くため表示しない
    expect(findTextByJoinedChildren(root, ' （胸で絞り込み中）')).toBeUndefined();
  });

  test('「全て」に戻すと絞り込みが解除され、全カード表示とバッジ消去が復元される', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ workoutSessionExerciseId: 1, category: 'chest' }), card({ workoutSessionExerciseId: 2, category: 'leg', name: 'スクワット' })],
      retry: jest.fn(),
    });
    const root = render();

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });
    expect(root.findAllByProps({ children: 'スクワット' }).length).toBe(0);

    const allChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '全て')!;
    act(() => {
      allChip.props.onPress();
    });

    expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
    expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
    expect(findTextByJoinedChildren(root, ' （胸で絞り込み中）')).toBeUndefined();
  });

  test('選択中カテゴリ(activeFilter)・日別カテゴリ集合(categorySetByDay)がSwipeableMonthViewへ正しく渡る', () => {
    mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
    const root = render();

    expect(mockSwipeableMonthView).toHaveBeenLastCalledWith(expect.objectContaining({ activeFilter: null }));

    const chestChip = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '胸')!;
    act(() => {
      chestChip.props.onPress();
    });

    expect(mockSwipeableMonthView).toHaveBeenLastCalledWith(expect.objectContaining({ activeFilter: 'chest' }));
  });
});
