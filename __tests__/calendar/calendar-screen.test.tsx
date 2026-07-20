const mockPush = jest.fn();
const mockUseWorkoutSessions = jest.fn();
const mockUseCalendarDayExercises = jest.fn();
const mockUseCalendarDaySchedule = jest.fn();
const mockUseCalendarDayManualSchedule = jest.fn();
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

jest.mock('@/hooks/use-calendar-month-schedule', () => ({
  useCalendarMonthSchedule: () => ({ primaryCategoryByScheduleDay: new Map(), categorySetByScheduleDay: new Map() }),
}));

jest.mock('@/hooks/use-calendar-day-schedule', () => ({
  useCalendarDaySchedule: () => mockUseCalendarDaySchedule(),
}));

jest.mock('@/hooks/use-calendar-day-manual-schedule', () => ({
  useCalendarDayManualSchedule: () => mockUseCalendarDayManualSchedule(),
}));

const mockEndWorkoutSession = jest.fn();
const mockStartWorkoutFromRoutine = jest.fn();
jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
  startWorkoutFromRoutine: (...args: unknown[]) => mockStartWorkoutFromRoutine(...args),
}));

const mockRemoveScheduledWorkout = jest.fn();
jest.mock('@/lib/notifications/scheduled-workout-scheduler', () => ({
  removeScheduledWorkout: (...args: unknown[]) => mockRemoveScheduledWorkout(...args),
}));

const mockSkipReminderOccurrence = jest.fn();
jest.mock('@/lib/notifications/reminder-skip-scheduler', () => ({
  skipReminderOccurrence: (...args: unknown[]) => mockSkipReminderOccurrence(...args),
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
import { Alert, Text, TouchableOpacity } from 'react-native';
import CalendarScreen from '@/app/(tabs)/calendar';
import { toDateKey } from '@/lib/calendar/date-grid';

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(CalendarScreen));
  });
  return instance.root;
}

function findTextByJoinedChildren(root: ReactTestInstance, text: string) {
  return root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === text);
}

function selectDate(date: Date) {
  const lastCall = mockSwipeableMonthView.mock.calls[mockSwipeableMonthView.mock.calls.length - 1][0] as {
    onSelectDate: (d: Date) => void;
  };
  act(() => {
    lastCall.onSelectDate(date);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
  mockUseCalendarDaySchedule.mockReturnValue({ cards: [] });
  mockUseCalendarDayManualSchedule.mockReturnValue([]);
  mockUseWorkoutSessions.mockReturnValue({ sessions: [], activeSession: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
  mockSkipReminderOccurrence.mockResolvedValue({ notificationSuppressed: true });
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
      sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
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

  // デザイン案「確定：カテゴリフィルタ適用」の仕様上、フィルターは月グリッドのマーカー表示
  // だけに作用し、選択日パネルは常に全記録を表示する（選択した日の記録を隠す必要はない）
  test('カテゴリチップを選んでも、選択日パネルの表示は変わらず全カードのまま', () => {
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
    expect(root.findByProps({ children: 'スクワット' })).toBeDefined();
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

describe('CalendarScreen 時間帯グループ', () => {
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
      sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
      isBest: false,
      comparison: null,
      sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
      ...overrides,
    };
  }

  test('セッションが1件だけの日は時間帯見出しを表示しない（従来通りのフラット表示）', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ sessionId: 1, sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime() })],
      retry: jest.fn(),
    });
    const root = render();

    expect(findTextByJoinedChildren(root, '朝 07:10')).toBeUndefined();
    expect(root.findByProps({ children: 'ベンチプレス' })).toBeDefined();
  });

  test('同日に複数セッションがあれば時間帯見出し(朝/夜)が時刻順に表示される', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        card({
          workoutSessionExerciseId: 1,
          sessionId: 1,
          sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
          name: '朝の種目',
        }),
        card({
          workoutSessionExerciseId: 2,
          sessionId: 2,
          sessionStartedAt: new Date(2026, 6, 16, 21, 30).getTime(),
          name: '夜の種目',
        }),
      ],
      retry: jest.fn(),
    });
    const root = render();

    expect(findTextByJoinedChildren(root, '朝 07:10')).toBeDefined();
    expect(findTextByJoinedChildren(root, '夜 21:30')).toBeDefined();
    // 見出しの並び順が時刻順（朝→夜）であることを、Textツリー上の出現順で確認する
    const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    const morningIndex = allTexts.indexOf('朝 07:10');
    const nightIndex = allTexts.indexOf('夜 21:30');
    expect(morningIndex).toBeGreaterThanOrEqual(0);
    expect(nightIndex).toBeGreaterThan(morningIndex);
  });

  test('各グループには自分のセッションの種目カードだけが入る', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        card({
          workoutSessionExerciseId: 1,
          sessionId: 1,
          sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
          name: '朝の種目',
        }),
        card({
          workoutSessionExerciseId: 2,
          sessionId: 2,
          sessionStartedAt: new Date(2026, 6, 16, 21, 30).getTime(),
          name: '夜の種目',
        }),
      ],
      retry: jest.fn(),
    });
    const root = render();

    expect(root.findByProps({ children: '朝の種目' })).toBeDefined();
    expect(root.findByProps({ children: '夜の種目' })).toBeDefined();
  });

  test('同じ時間帯(朝)に2セッションあっても、片方に潰れず2つの見出しが別々に表示される', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        card({
          workoutSessionExerciseId: 1,
          sessionId: 1,
          sessionStartedAt: new Date(2026, 6, 16, 6, 0).getTime(),
          name: '朝1の種目',
        }),
        card({
          workoutSessionExerciseId: 2,
          sessionId: 2,
          sessionStartedAt: new Date(2026, 6, 16, 9, 30).getTime(),
          name: '朝2の種目',
        }),
      ],
      retry: jest.fn(),
    });
    const root = render();

    expect(findTextByJoinedChildren(root, '朝 06:00')).toBeDefined();
    expect(findTextByJoinedChildren(root, '朝 09:30')).toBeDefined();
    expect(root.findByProps({ children: '朝1の種目' })).toBeDefined();
    expect(root.findByProps({ children: '朝2の種目' })).toBeDefined();
  });

  test('3セッション以上でも全て時刻順に見出しが並ぶ', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        card({ workoutSessionExerciseId: 1, sessionId: 1, sessionStartedAt: new Date(2026, 6, 16, 20, 0).getTime(), name: '夜の種目' }),
        card({ workoutSessionExerciseId: 2, sessionId: 2, sessionStartedAt: new Date(2026, 6, 16, 7, 0).getTime(), name: '朝の種目' }),
        card({ workoutSessionExerciseId: 3, sessionId: 3, sessionStartedAt: new Date(2026, 6, 16, 12, 0).getTime(), name: '昼の種目' }),
      ],
      retry: jest.fn(),
    });
    const root = render();
    const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    const idx = (s: string) => allTexts.indexOf(s);
    expect(idx('朝 07:00')).toBeGreaterThanOrEqual(0);
    expect(idx('昼 12:00')).toBeGreaterThan(idx('朝 07:00'));
    expect(idx('夜 20:00')).toBeGreaterThan(idx('昼 12:00'));
  });
});

describe('CalendarScreen 予定（PR9-2: リマインダー由来の未来予定表示）', () => {
  function scheduleCard(overrides: Record<string, unknown> = {}) {
    return {
      reminderId: 1,
      routineId: 10,
      routineName: '胸の日',
      categories: ['chest', 'shoulder'],
      exerciseCount: 4,
      hour: 20,
      minute: 0,
      reminder: {
        id: 1,
        routineId: 10,
        title: '胸の日',
        body: '',
        kind: 'weekly',
        hour: 20,
        minute: 0,
        weekdays: '[0]',
        monthdays: null,
        anchorDate: null,
        intervalDays: null,
        intervalMonths: null,
        nthWeek: null,
        nthWeekdays: null,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
      ...overrides,
    };
  }

  function daySchedule(cards: ReturnType<typeof scheduleCard>[]) {
    return { cards };
  }

  test('今日、実績が無く予定だけある場合、予定カードに「今日 HH:MM」と開始ボタンが表示される', () => {
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();

    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(findTextByJoinedChildren(root, '今日 20:00')).toBeDefined();
    expect(root.findAllByProps({ children: '開始' }).length).toBeGreaterThan(0);
  });

  test('今日、予定カードには「予定」ラベルの見出しが付かない（カード自身の時刻バッジと二重表示になるため、PR10-4でSessionTimeGroupHeaderを予定エントリには出さないよう変更）', () => {
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();
    expect(findTextByJoinedChildren(root, '予定')).toBeUndefined();
  });

  test('今日、実績と予定が両方ある場合、時刻順に混ざって表示される（予定側は自身の時刻バッジのみで、実績側とは別カード形状のため見出しの「予定」ラベルは付けない、PR10-4で時刻の二重表示を解消）', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 1,
          name: '朝の種目',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 1,
          sessionStartedAt: new Date(2026, 6, 16, 7, 10).getTime(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ hour: 20, minute: 0 })]));
    const root = render();

    expect(findTextByJoinedChildren(root, '朝 07:10')).toBeDefined();
    expect(root.findByProps({ children: '朝の種目' })).toBeDefined();
    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(findTextByJoinedChildren(root, '今日 20:00')).toBeDefined();

    const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    const morningIndex = allTexts.indexOf('朝 07:10');
    const scheduleTimeIndex = allTexts.indexOf('今日 20:00');
    expect(scheduleTimeIndex).toBeGreaterThan(morningIndex);
  });

  test('今日、進行中セッションがあり予定もある場合、再開バナーと予定カードの両方が表示される', () => {
    mockUseWorkoutSessions.mockReturnValue({
      sessions: [{ id: 9, startedAt: 0, endedAt: null }],
      activeSession: { id: 9, startedAt: 0, endedAt: null },
    });
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();

    expect(
      root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '進行中のトレーニングを再開する'),
    ).toBeDefined();
    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
  });

  test('未来日を選択すると、予定カードは開始ボタン無しで表示され、時刻ラベルは頻度表示になる', () => {
    const root = render();
    const future = new Date();
    future.setDate(future.getDate() + 5);
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    selectDate(future);

    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(root.findAllByProps({ children: '開始' }).length).toBe(0);
    expect(findTextByJoinedChildren(root, '今日 20:00')).toBeUndefined();
  });

  test('未来日を選択して予定が無い場合、「予定がありません」+有効な「予定を追加」ボタンを表示し、押すとルーティン選択画面へ遷移する（PR10）', () => {
    const root = render();
    const future = new Date();
    future.setDate(future.getDate() + 5);
    selectDate(future);

    expect(root.findByProps({ children: '予定がありません' })).toBeDefined();
    const addBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加');
    expect(addBtn).toBeDefined();
    expect(addBtn!.props.disabled).toBeFalsy();

    act(() => {
      addBtn!.props.onPress();
    });
    const expectedDateKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-routine-picker',
      params: { dateKey: expectedDateKey },
    });
  });

  test('過去日を選択すると、useCalendarDayScheduleが予定を返していても表示されない（過去日は実績のみ）', () => {
    const root = render();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
    selectDate(past);

    expect(root.findAllByProps({ children: '胸の日' }).length).toBe(0);
    expect(root.findByProps({ children: '記録がありません' })).toBeDefined();
  });

  // 過去日・記録なしパネルの「記録を追加」（2026-07-20、デザイン検討/スケジュール（カレンダー）
  // 機能 デザイン案.htmlの「② 過去」を実装）
  test('過去日・記録なしの場合、「記録を追加」ボタンが表示され、押すと選択日のdateKeyでstart-chooserへ遷移する', () => {
    const root = render();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
    selectDate(past);

    const addBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '記録を追加')!;
    expect(addBtn).toBeDefined();

    act(() => {
      addBtn.props.onPress();
    });

    const expectedDateKey = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/workout/start-chooser',
      params: { pastDateKey: expectedDateKey },
    });
  });

  describe('手動で追加した予定(PR10)', () => {
    function manualCard(overrides: Record<string, unknown> = {}) {
      return {
        scheduledWorkoutId: 1,
        routineId: 20,
        routineName: '脚の日',
        categories: ['leg'],
        exerciseCount: 3,
        hour: 19,
        minute: 30,
        ...overrides,
      };
    }

    test('未来日に手動予定があれば表示され、時刻ラベルは「HH:MM」の素の表記になる（頻度表示は付かない）', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      selectDate(future);

      expect(root.findByProps({ children: '脚の日' })).toBeDefined();
      expect(findTextByJoinedChildren(root, '19:30')).toBeDefined();
    });

    test('同じルーティンがリマインダー予定・手動予定の両方にある場合、手動予定だけが表示される（重複排除）', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 20, routineName: '脚の日' })]));
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, routineName: '脚の日' })]);
      selectDate(future);

      // 「脚の日」の予定カードは1枚だけ（重複表示されない）。findAllByType(TouchableOpacity)の
      // accessibilityLabelで数える（findAllByProps({children:'脚の日'})はTextの内部ホスト要素まで
      // 二重にマッチするため、カード単位の存在確認には使えない）
      const cards = root
        .findAllByType(TouchableOpacity)
        .filter((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('脚の日、'));
      expect(cards.length).toBe(1);
      // 手動予定側の素の時刻表記が使われている（リマインダー側のformatKindSummaryではない）
      expect(findTextByJoinedChildren(root, '19:30')).toBeDefined();
    });

    test('過去日を選択すると、手動予定を返していても表示されない（過去日は実績のみ）', () => {
      const root = render();
      const past = new Date();
      past.setDate(past.getDate() - 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
      selectDate(past);

      expect(root.findAllByProps({ children: '脚の日' }).length).toBe(0);
      expect(root.findByProps({ children: '記録がありません' })).toBeDefined();
    });

    test('既に予定が1件ある日でも一覧末尾に「予定を追加」ボタンが表示され、押すとその日のdateKeyでルーティン選択画面へ遷移する（2件目以降を追加する導線、PRレビュー指摘対応）', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      selectDate(future);

      expect(root.findByProps({ children: '脚の日' })).toBeDefined();
      const addBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')!;
      expect(addBtn).toBeDefined();

      act(() => {
        addBtn.props.onPress();
      });
      const expectedDateKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-routine-picker',
        params: { dateKey: expectedDateKey },
      });
    });

    describe('⋮メニューからの削除(PR10-3)', () => {
      function selectFutureDayWithManualCard() {
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 5);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
        selectDate(future);
        return root;
      }

      // accessibilityLabelは「「routineName」timeLabelのメニューを開く」形式（timeLabelも含めて
      // 一意にする、PRレビュー指摘対応）。呼び出し側では時刻までは指定せずroutineNameだけで
      // 引っかけたいのでstartsWithで判定する
      function findMenuTrigger(root: ReactTestInstance, routineName: string) {
        return root
          .findAllByType(TouchableOpacity)
          .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith(`「${routineName}」`) && t.props.accessibilityLabel.endsWith('のメニューを開く'));
      }

      function findAllMenuTriggers(root: ReactTestInstance) {
        return root
          .findAllByType(TouchableOpacity)
          .filter((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.endsWith('のメニューを開く'));
      }

      test('手動予定カード・リマインダー予定カードのどちらにも⋮メニューがあり、どちらも「削除」を持つ（リマインダー予定はさらに「今回だけ差し替え」も持つ、2026-07-19: リマインダー側も「今回だけスキップ」から統一）', () => {
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 5);
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 10, routineName: '胸の日' })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, routineName: '脚の日' })]);
        selectDate(future);

        expect(findAllMenuTriggers(root).length).toBe(2);
        expect(findMenuTrigger(root, '脚の日')).toBeDefined();
        expect(findMenuTrigger(root, '胸の日')).toBeDefined();

        act(() => {
          findMenuTrigger(root, '脚の日')!.props.onPress();
        });
        expect(root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === '削除')).toBe(true);
        expect(root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === '今回だけ差し替え')).toBe(false);

        act(() => {
          findMenuTrigger(root, '胸の日')!.props.onPress();
        });
        expect(root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === '削除')).toBe(true);
        expect(root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === '今回だけ差し替え')).toBe(true);
      });

      test('⋮→削除で確認Alertを出し、確認するとremoveScheduledWorkoutにscheduledWorkoutIdを渡す', async () => {
        const root = selectFutureDayWithManualCard();
        act(() => {
          findMenuTrigger(root, '脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });

        expect(Alert.alert).toHaveBeenCalledWith(
          'この予定を削除しますか？',
          '「脚の日」の予定を削除します。ルーティン自体や記録には影響しませんが、設定していた通知も届かなくなります。',
          expect.any(Array),
        );
        expect(mockRemoveScheduledWorkout).not.toHaveBeenCalled();

        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
        await act(async () => {
          await confirmAction.onPress();
        });
        expect(mockRemoveScheduledWorkout).toHaveBeenCalledWith(1);
      });

      test('確認Alertで「キャンセル」相当（confirmを呼ばない）場合はremoveScheduledWorkoutが呼ばれない', () => {
        const root = selectFutureDayWithManualCard();
        act(() => {
          findMenuTrigger(root, '脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });

        expect(mockRemoveScheduledWorkout).not.toHaveBeenCalled();
      });

      test('削除に失敗した場合はエラーAlertを表示し、mockRemoveScheduledWorkoutの呼び出し以外は何も壊れない', async () => {
        mockRemoveScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const root = selectFutureDayWithManualCard();
        act(() => {
          findMenuTrigger(root, '脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
        await act(async () => {
          await confirmAction.onPress();
        });

        expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を削除できませんでした。');
        // 削除失敗後もカード自体はクラッシュせず残っている
        expect(root.findByProps({ children: '脚の日' })).toBeDefined();
      });

      test('removeScheduledWorkoutが例外を投げずresolveした場合（対象行が既に無い場合等のサイレント成功仕様）、エラーAlertは出ない', async () => {
        const root = selectFutureDayWithManualCard();
        act(() => {
          findMenuTrigger(root, '脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
        await act(async () => {
          await confirmAction.onPress();
        });

        expect(Alert.alert).not.toHaveBeenCalledWith('エラー', expect.anything());
      });

      describe('複数の手動予定・リマインダー予定が混在する場合', () => {
        function secondManualCard() {
          return manualCard({ scheduledWorkoutId: 2, routineId: 21, routineName: '背中の日', hour: 20, minute: 0 });
        }

        test('2件目の手動予定の⋮→削除では、2件目のscheduledWorkoutIdとルーティン名が渡る', async () => {
          const root = render();
          const future = new Date();
          future.setDate(future.getDate() + 5);
          mockUseCalendarDayManualSchedule.mockReturnValue([manualCard(), secondManualCard()]);
          selectDate(future);

          expect(findAllMenuTriggers(root).length).toBe(2);
          act(() => {
            findMenuTrigger(root, '背中の日')!.props.onPress();
          });
          const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
          act(() => {
            deleteItem.props.onPress();
          });

          expect(Alert.alert).toHaveBeenCalledWith(
            'この予定を削除しますか？',
            '「背中の日」の予定を削除します。ルーティン自体や記録には影響しませんが、設定していた通知も届かなくなります。',
            expect.any(Array),
          );
          const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
          const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
          await act(async () => {
            await confirmAction.onPress();
          });
          expect(mockRemoveScheduledWorkout).toHaveBeenCalledWith(2);
          expect(mockRemoveScheduledWorkout).not.toHaveBeenCalledWith(1);
        });

        test('リマインダー予定・手動予定が2件ずつ混在すると、⋮は4件とも表示される(どちらも「削除」を持つ、2026-07-19)', () => {
          const root = render();
          const future = new Date();
          future.setDate(future.getDate() + 5);
          mockUseCalendarDaySchedule.mockReturnValue(
            daySchedule([
              scheduleCard({ reminderId: 1, routineId: 10, routineName: '胸の日' }),
              scheduleCard({ reminderId: 2, routineId: 11, routineName: '肩の日' }),
            ]),
          );
          mockUseCalendarDayManualSchedule.mockReturnValue([manualCard(), secondManualCard()]);
          selectDate(future);

          expect(findAllMenuTriggers(root).length).toBe(4);
        });

        test('1件削除すると、削除対象だけが消え他方は残る（useLiveQueryの再購読をモック更新+再選択で模擬）', () => {
          const root = render();
          const future = new Date();
          future.setDate(future.getDate() + 5);
          mockUseCalendarDayManualSchedule.mockReturnValue([manualCard(), secondManualCard()]);
          selectDate(future);
          expect(root.findByProps({ children: '脚の日' })).toBeDefined();
          expect(root.findByProps({ children: '背中の日' })).toBeDefined();

          // 「脚の日」(id=1)だけ削除された後の状態をモックに反映。selectedDateは同じ日でも
          // 新しいDateインスタンスで渡さないと、setStateが同一参照とみなして再レンダーされない
          mockUseCalendarDayManualSchedule.mockReturnValue([secondManualCard()]);
          selectDate(new Date(future));

          // findAllByProps({children:'脚の日'})はTextの内部ホスト要素まで二重にマッチするため、
          // ⋮トリガーのaccessibilityLabel(ルーティン名を含む)で存在確認する
          expect(findMenuTrigger(root, '脚の日')).toBeUndefined();
          expect(findMenuTrigger(root, '背中の日')).toBeDefined();
        });
      });

      test('今日自身の手動予定も選択日パネルに表示され、「今日 HH:MM」表記＋⋮メニューが出る（PR10-4、選択日が今日になった瞬間消えていたバグの修正）', () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '今日だけの脚の日', hour: 19, minute: 30 })]);
        const root = render();
        // selectDateしない=今日が選択されたまま

        expect(root.findByProps({ children: '今日だけの脚の日' })).toBeDefined();
        expect(findTextByJoinedChildren(root, '今日 19:30')).toBeDefined();
        expect(findMenuTrigger(root, '今日だけの脚の日')).toBeDefined();
      });

      test('今日自身の手動予定の⋮→削除で確認Alert→confirmでremoveScheduledWorkoutが呼ばれる', async () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '今日だけの脚の日' })]);
        const root = render();

        act(() => {
          findMenuTrigger(root, '今日だけの脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
        await act(async () => {
          await confirmAction.onPress();
        });

        expect(mockRemoveScheduledWorkout).toHaveBeenCalledWith(1);
      });

      test('今日自身の手動予定の削除に失敗した場合もエラーAlertを表示する（開始ボタン付きレイアウトでも共通ハンドラが機能すること、PR10-4）', async () => {
        mockRemoveScheduledWorkout.mockRejectedValueOnce(new Error('fail'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '今日だけの脚の日' })]);
        const root = render();

        act(() => {
          findMenuTrigger(root, '今日だけの脚の日')!.props.onPress();
        });
        const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
        act(() => {
          deleteItem.props.onPress();
        });
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
        await act(async () => {
          await confirmAction.onPress();
        });

        expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を削除できませんでした。');
      });

      test('今日自身の手動予定にも「開始」ボタンが表示され、押すとstartWorkoutFromRoutineが呼ばれる（リマインダー予定と同じ扱い、PR10-4）', async () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, routineName: '今日だけの脚の日' })]);
        const root = render();

        const startBtn = root
          .findAllByType(TouchableOpacity)
          .find((t) => t.props.accessibilityLabel === '「今日だけの脚の日」のトレーニングを開始')!;
        await act(async () => {
          await startBtn.props.onPress();
        });

        expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(20);
        expect(mockPush).toHaveBeenCalledWith('/workout/77');
      });

      test('今日、同じルーティンがリマインダー予定・手動予定の両方にある場合、手動予定だけが表示される（未来日と同じdedupeを今日にも適用、PR10-4）', () => {
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 20, routineName: '脚の日' })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, routineName: '脚の日' })]);
        const root = render();

        const cards = root
          .findAllByType(TouchableOpacity)
          .filter((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('脚の日、'));
        expect(cards.length).toBe(1);
        expect(findMenuTrigger(root, '脚の日')).toBeDefined();
      });

      test('今日、手動予定が1件以上ある場合、一覧末尾に「予定を追加」ボタンが表示される（PR10-4）', () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
        const root = render();

        expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')).toBeDefined();
      });

      test('今日、実績・予定とも0件の場合は「予定を追加」ボタンを表示しない（今日の第一級アクションは「トレーニングを開始」のみ、未来日の空状態とは非対称な現行仕様の固定）', () => {
        const root = render();
        expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')).toBeUndefined();
      });

      test('今日パネルの「予定を追加」ボタンを押すと、選択日(=今日)のdateKeyでルーティン選択画面へ遷移する（PR10-4）', () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
        const root = render();

        const addBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')!;
        act(() => {
          addBtn.props.onPress();
        });

        const today = new Date();
        const expectedDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/calendar/schedule-routine-picker',
          params: { dateKey: expectedDateKey },
        });
      });

      test('今日、実績セッション・リマインダー予定・手動予定の3種が混在しても時刻順に統合表示される（PR10-4）', () => {
        // セッションのsessionStartedAtも予定のhour/minute同様「実際の今日」基準で組み立てないと、
        // 固定の過去日付にしてしまうとエポック値が小さくなり常に先頭に来てしまい、時刻順の
        // 検証にならない（テスト実装時に一度踏んだ落とし穴）
        const today = new Date();
        mockUseCalendarDayExercises.mockReturnValue({
          cards: [
            {
              workoutSessionExerciseId: 1,
              exerciseId: 1,
              name: '昼の実績種目',
              category: 'chest',
              measurementType: 'weight_reps',
              source: 'preset',
              slug: 'bench-press',
              sessionId: 1,
              sessionStartedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0).getTime(),
              isBest: false,
              comparison: null,
              sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
            },
          ],
          retry: jest.fn(),
        });
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 10, routineName: '朝の予定', hour: 7, minute: 0 })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 21, routineName: '夜の手動予定', hour: 19, minute: 30 })]);
        const root = render();

        const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
        const idx = (s: string) => allTexts.indexOf(s);
        expect(idx('朝の予定')).toBeGreaterThanOrEqual(0);
        expect(idx('昼の実績種目')).toBeGreaterThan(idx('朝の予定'));
        expect(idx('夜の手動予定')).toBeGreaterThan(idx('昼の実績種目'));
      });

      test('今日、進行中セッションがあり手動予定のみある場合（リマインダー予定なし）、再開バナーと手動予定カードの両方が表示される（PR10-4）', () => {
        mockUseWorkoutSessions.mockReturnValue({
          sessions: [{ id: 9, startedAt: 0, endedAt: null }],
          activeSession: { id: 9, startedAt: 0, endedAt: null },
        });
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '進行中と併存する脚の日' })]);
        const root = render();

        expect(
          root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '進行中のトレーニングを再開する'),
        ).toBeDefined();
        expect(root.findByProps({ children: '進行中と併存する脚の日' })).toBeDefined();
      });

      test('未来日で手動予定を表示した状態から選択日を今日に戻しても、手動予定が消えない（選択日が今日になった瞬間に消えていたバグの回帰、PR10-4の本来の目的）', () => {
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 3);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '往復テストの脚の日' })]);

        selectDate(future);
        expect(root.findByProps({ children: '往復テストの脚の日' })).toBeDefined();

        selectDate(new Date());
        expect(root.findByProps({ children: '往復テストの脚の日' })).toBeDefined();
      });

      test('過去日を選択した後に選択日を今日に戻すと、手動予定が再表示される', () => {
        const root = render();
        const past = new Date();
        past.setDate(past.getDate() - 3);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineName: '往復テストの脚の日2' })]);
        mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });

        selectDate(past);
        expect(root.findAllByProps({ children: '往復テストの脚の日2' }).length).toBe(0);

        selectDate(new Date());
        expect(root.findByProps({ children: '往復テストの脚の日2' })).toBeDefined();
      });
    });
  });

  describe('リマインダー予定の削除(2026-07-19: 「今回だけスキップ」から「削除」へ変更。確認ダイアログ付き、ゴーストカードUIは廃止)', () => {
    function skipCard(overrides: Record<string, unknown> = {}) {
      // reminderId/routineId/routineName/hour/minuteのoverrideは、下のreminder(card.reminder.id等、
      // ScheduleEntryCard/handleDeleteReminderOccurrenceが実際に参照する側)にも反映する必要がある
      // （replaceCard関数と同じパターン。反映し忘れると複数リマインダーが混在するテストで
      // 常に1件目のreminderIdが使われてしまう、@tester指摘で発覚したバグ）
      const reminderId = (overrides.reminderId as number | undefined) ?? 1;
      const routineId = (overrides.routineId as number | undefined) ?? 10;
      const routineName = (overrides.routineName as string | undefined) ?? '胸の日';
      const hour = (overrides.hour as number | undefined) ?? 20;
      const minute = (overrides.minute as number | undefined) ?? 0;
      return {
        reminderId,
        routineId,
        routineName,
        categories: ['chest'],
        exerciseCount: 3,
        hour,
        minute,
        reminder: {
          id: reminderId,
          routineId,
          title: routineName,
          body: '',
          kind: 'weekly',
          hour,
          minute,
          weekdays: '[0]',
          monthdays: null,
          anchorDate: null,
          intervalDays: null,
          intervalMonths: null,
          nthWeek: null,
          nthWeekdays: null,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        ...overrides,
      };
    }
    function daySchedule(cards: ReturnType<typeof skipCard>[]) {
      return { cards };
    }
    function findMenuTrigger(root: ReactTestInstance, routineName: string) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith(`「${routineName}」`) && t.props.accessibilityLabel.endsWith('のメニューを開く'));
    }
    function pressConfirmDelete() {
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '削除');
      return confirmAction.onPress();
    }

    test('未来日: ⋮→「削除」を押すと確認Alertを出し、確認するとskipReminderOccurrenceに(reminderId, 選択日のdateKey)が渡る', async () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([skipCard()]));
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'この回の予定を削除しますか？',
        '「胸の日」の今回の予定を削除します。次回以降の予定やリマインダー自体には影響しません。今回分の通知も届かなくなります。',
        expect.any(Array),
      );
      expect(mockSkipReminderOccurrence).not.toHaveBeenCalled();

      await act(async () => {
        await pressConfirmDelete();
      });
      expect(mockSkipReminderOccurrence).toHaveBeenCalledWith(1, toDateKey(future));
    });

    test('確認Alertで「キャンセル」相当（confirmを呼ばない）場合はskipReminderOccurrenceが呼ばれない', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([skipCard()]));
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });

      expect(mockSkipReminderOccurrence).not.toHaveBeenCalled();
    });

    test('notificationSuppressed: falseの場合(通知APIの想定外エラー等)、その旨のAlertを表示する（PR10-6cでネイティブ方式も抑止可能になったため文言更新、2026-07-19に削除文言へ再更新）', async () => {
      mockSkipReminderOccurrence.mockResolvedValueOnce({ notificationSuppressed: false });
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([skipCard()]));
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });
      await act(async () => {
        await pressConfirmDelete();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        '予定を削除しました',
        '削除自体は完了しています。ただし新しい通知の登録処理に失敗した可能性があるため、念のため指定時刻に通知が届いていないかご確認ください。',
      );
    });

    test('削除に失敗した場合はエラーAlertを表示する', async () => {
      mockSkipReminderOccurrence.mockRejectedValueOnce(new Error('fail'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([skipCard()]));
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });
      await act(async () => {
        await pressConfirmDelete();
      });

      expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を削除できませんでした。');
    });

    test('今日: ⋮→「削除」を押して確認するとskipReminderOccurrenceに今日のdateKeyが渡る', async () => {
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([skipCard()]));
      const root = render();

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });
      await act(async () => {
        await pressConfirmDelete();
      });

      expect(mockSkipReminderOccurrence).toHaveBeenCalledWith(1, toDateKey(new Date()));
    });

    test('同日に複数のリマインダー予定がある場合、2件目の⋮→削除では2件目のreminderIdが渡る（取り消し不可の削除になったため、@tester指摘: 対象取り違えのリスクが手動予定の同種テストと同水準であることを確認）', async () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(
        daySchedule([
          skipCard({ reminderId: 1, routineId: 10, routineName: '胸の日', hour: 7, minute: 0 }),
          skipCard({ reminderId: 2, routineId: 11, routineName: '背中の日', hour: 20, minute: 0 }),
        ]),
      );
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '背中の日')!.props.onPress();
      });
      const deleteItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '削除')!;
      act(() => {
        deleteItem.props.onPress();
      });
      await act(async () => {
        await pressConfirmDelete();
      });

      expect(mockSkipReminderOccurrence).toHaveBeenCalledWith(2, toDateKey(future));
      expect(mockSkipReminderOccurrence).not.toHaveBeenCalledWith(1, expect.anything());
    });
  });

  describe('リマインダー予定の「今回だけ差し替え」(PR10-6b)', () => {
    function replaceCard(overrides: Record<string, unknown> = {}) {
      const reminderId = (overrides.reminderId as number | undefined) ?? 1;
      const routineId = (overrides.routineId as number | undefined) ?? 10;
      const routineName = (overrides.routineName as string | undefined) ?? '胸の日';
      const hour = (overrides.hour as number | undefined) ?? 7;
      const minute = (overrides.minute as number | undefined) ?? 30;
      return {
        reminderId,
        routineId,
        routineName,
        categories: ['chest'],
        exerciseCount: 3,
        hour,
        minute,
        reminder: {
          id: reminderId,
          routineId,
          title: routineName,
          body: '',
          kind: 'weekly',
          hour,
          minute,
          weekdays: '[0]',
          monthdays: null,
          anchorDate: null,
          intervalDays: null,
          intervalMonths: null,
          nthWeek: null,
          nthWeekdays: null,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        ...overrides,
      };
    }
    function daySchedule(cards: ReturnType<typeof replaceCard>[]) {
      return { cards };
    }
    function manualCard(overrides: Record<string, unknown> = {}) {
      return {
        scheduledWorkoutId: 99,
        routineId: 30,
        routineName: '背中の日',
        categories: ['back'],
        exerciseCount: 4,
        hour: 7,
        minute: 30,
        ...overrides,
      };
    }
    function findMenuTrigger(root: ReactTestInstance, routineName: string) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith(`「${routineName}」`) && t.props.accessibilityLabel.endsWith('のメニューを開く'));
    }

    test('未来日: ⋮→「今回だけ差し替え」を押すと確認Alertを出さず、schedule-routine-pickerへreminderId/routineName/hour/minuteをString化して渡す', async () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([replaceCard()]));
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const replaceItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '今回だけ差し替え')!;
      act(() => {
        replaceItem.props.onPress();
      });

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-routine-picker',
        params: {
          dateKey: toDateKey(future),
          replaceReminderId: '1',
          replaceRoutineName: '胸の日',
          replaceHour: '7',
          replaceMinute: '30',
        },
      });
    });

    test('今日: ⋮→「今回だけ差し替え」を押すと今日のdateKeyで遷移する', () => {
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([replaceCard()]));
      const root = render();

      act(() => {
        findMenuTrigger(root, '胸の日')!.props.onPress();
      });
      const replaceItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '今回だけ差し替え')!;
      act(() => {
        replaceItem.props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ dateKey: toDateKey(new Date()) }) }),
      );
    });

    test('複数のリマインダー予定が並んでいても、押したカードに対応するreminderId/routineNameが渡る(先頭固定になっていないことの確認)', () => {
      mockUseCalendarDaySchedule.mockReturnValue(
        daySchedule([
          replaceCard({ reminderId: 1, routineId: 10, routineName: '胸の日', hour: 7, minute: 30 }),
          replaceCard({ reminderId: 2, routineId: 11, routineName: '脚の日', hour: 20, minute: 0 }),
        ]),
      );
      const root = render();

      act(() => {
        findMenuTrigger(root, '脚の日')!.props.onPress();
      });
      const replaceItem = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '今回だけ差し替え')!;
      act(() => {
        replaceItem.props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ replaceReminderId: '2', replaceRoutineName: '脚の日', replaceHour: '20', replaceMinute: '0' }),
        }),
      );
    });

    test('手動予定カードには「今回だけ差し替え」は表示されない(onDeleteが排他的に渡るため)', () => {
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([]));
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      const root = render();
      selectDate(future);

      act(() => {
        findMenuTrigger(root, '背中の日')!.props.onPress();
      });
      expect(root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === '今回だけ差し替え')).toBe(
        false,
      );
    });

    test('差し替え後: リマインダーの元の予定は表示されず、差し替え先の新しい手動予定カードだけが表示される(2026-07-19: ゴーストカードUIは廃止)', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      // 差し替え後、元のリマインダー発火はreminderScheduleSkipsで除外されるためcardsは空
      // （useCalendarDaySchedule自体の除外ロジックはuse-calendar-day-schedule.test.tsの責務）
      mockUseCalendarDaySchedule.mockReturnValue({ cards: [] });
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      const root = render();
      selectDate(future);

      expect(root.findAllByProps({ children: '07:30・スキップ済み' }).length).toBe(0);
      expect(root.findByProps({ children: '背中の日' })).toBeDefined();
    });

    test('同じルーティンへの差し替え(時刻だけ変える場合)でも、新しい手動予定カードだけが重複なく表示される(2026-07-19: ゴーストカードUIは廃止)', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue({ cards: [] });
      mockUseCalendarDayManualSchedule.mockReturnValue([
        manualCard({ scheduledWorkoutId: 99, routineId: 10, routineName: '胸の日', hour: 21, minute: 0 }),
      ]);
      const root = render();
      selectDate(future);

      expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    });
  });

  describe('今日の予定カードの「開始」ボタン(handleStartRoutine)', () => {
    function findStartButton(root: ReactTestInstance) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => t.props.accessibilityLabel === '「胸の日」のトレーニングを開始')!;
    }

    test('進行中セッションが無ければAlertを出さず、そのままstartWorkoutFromRoutineでワークアウトを開始する', async () => {
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      const root = render();
      await act(async () => {
        await findStartButton(root).props.onPress();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(10);
      expect(mockPush).toHaveBeenCalledWith('/workout/77');
    });

    test('進行中セッションがある場合、開始ボタンを押しても無言で遷移せず確認Alertを出す', () => {
      mockUseWorkoutSessions.mockReturnValue({
        sessions: [{ id: 9, startedAt: 0, endedAt: null }],
        activeSession: { id: 9, startedAt: 0, endedAt: null },
      });
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      const root = render();
      act(() => {
        findStartButton(root).props.onPress();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        '実施中のトレーニングを終了しますか？',
        'ここまでの記録を保存して「胸の日」を開始しますか？',
        expect.any(Array),
      );
      expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalledWith('/workout/77');
    });

    test('Alertで「記録して開始」を選ぶと、endWorkoutSession→startWorkoutFromRoutineの順に呼ばれ、そのセッションへ遷移する', async () => {
      mockUseWorkoutSessions.mockReturnValue({
        sessions: [{ id: 9, startedAt: 0, endedAt: null }],
        activeSession: { id: 9, startedAt: 0, endedAt: null },
      });
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      const root = render();
      act(() => {
        findStartButton(root).props.onPress();
      });
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmAction = alertCall[2].find((b: { text?: string }) => b.text === '記録して開始');
      await act(async () => {
        await confirmAction.onPress();
      });

      expect(mockEndWorkoutSession).toHaveBeenCalledWith(9);
      expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(10);
      expect(mockPush).toHaveBeenCalledWith('/workout/77');
    });
  });
});
