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
  mockUseCalendarDaySchedule.mockReturnValue([]);
  mockUseCalendarDayManualSchedule.mockReturnValue([]);
  mockUseWorkoutSessions.mockReturnValue({ sessions: [], activeSession: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 77, cards: [] });
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

  test('今日、実績が無く予定だけある場合、予定カードに「今日 HH:MM」と開始ボタンが表示される', () => {
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
    const root = render();

    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(findTextByJoinedChildren(root, '今日 20:00')).toBeDefined();
    expect(root.findAllByProps({ children: '開始' }).length).toBeGreaterThan(0);
  });

  test('今日、予定が1件だけ（実績0件）の場合は時間帯見出しを表示しない（既存の「1件だけの日は見出し無し」ルールを予定単独でも踏襲）', () => {
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
    const root = render();
    expect(findTextByJoinedChildren(root, '予定')).toBeUndefined();
  });

  test('今日、実績と予定が両方ある場合、時刻順に混ざって表示され、予定側にだけ「予定」ラベルが付く', () => {
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
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard({ hour: 20, minute: 0 })]);
    const root = render();

    expect(findTextByJoinedChildren(root, '朝 07:10')).toBeDefined();
    expect(root.findByProps({ children: '朝の種目' })).toBeDefined();
    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(findTextByJoinedChildren(root, '予定')).toBeDefined();

    const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    const morningIndex = allTexts.indexOf('朝 07:10');
    const scheduleTagIndex = allTexts.indexOf('予定');
    expect(scheduleTagIndex).toBeGreaterThan(morningIndex);
  });

  test('今日、進行中セッションがあり予定もある場合、再開バナーと予定カードの両方が表示される', () => {
    mockUseWorkoutSessions.mockReturnValue({
      sessions: [{ id: 9, startedAt: 0, endedAt: null }],
      activeSession: { id: 9, startedAt: 0, endedAt: null },
    });
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
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
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
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
    mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
    mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });
    selectDate(past);

    expect(root.findAllByProps({ children: '胸の日' }).length).toBe(0);
    expect(root.findByProps({ children: '記録がありません' })).toBeDefined();
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
      mockUseCalendarDaySchedule.mockReturnValue([scheduleCard({ routineId: 20, routineName: '脚の日' })]);
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
  });

  describe('今日の予定カードの「開始」ボタン(handleStartRoutine)', () => {
    function findStartButton(root: ReactTestInstance) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => t.props.accessibilityLabel === '「胸の日」のトレーニングを開始')!;
    }

    test('進行中セッションが無ければAlertを出さず、そのままstartWorkoutFromRoutineでワークアウトを開始する', async () => {
      mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
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
      mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
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
      mockUseCalendarDaySchedule.mockReturnValue([scheduleCard()]);
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
