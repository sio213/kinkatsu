const mockPush = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockUseCalendarDayExercises = jest.fn();

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
  useCalendarMonthRecords: () => new Map(),
}));

// 日付選択UI自体（スワイプ・グリッド）はmonth-grid.test.tsx等の責務のため、
// このテストでは「今日・記録なし」パネルの配線だけを見たいので軽量スタブに差し替える
jest.mock('@/components/calendar/swipeable-month-view', () => ({
  SwipeableMonthView: () => null,
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import CalendarScreen from '@/app/(tabs)/calendar';

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(CalendarScreen));
  });
  return instance.root;
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
