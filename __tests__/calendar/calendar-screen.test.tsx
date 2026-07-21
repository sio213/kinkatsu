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
  // 再開バナー(ResumeWorkoutBanner)の表示情報。このテストファイルの関心事(バナーの表示有無・
  // 遷移先)には影響しない固定値でよいため、常に同じ値を返す軽量スタブにしている
  useResumeWorkoutSummary: () => ({
    completedExerciseCount: 0,
    totalExerciseCount: 0,
    completedSetCount: 0,
    routineName: null,
  }),
}));

jest.mock('@/hooks/use-ticking-now', () => ({
  useTickingNow: () => 0,
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
const mockStartWorkoutFromScheduledWorkout = jest.fn();
jest.mock('@/lib/workout/session', () => ({
  endWorkoutSession: (...args: unknown[]) => mockEndWorkoutSession(...args),
  startWorkoutFromRoutine: (...args: unknown[]) => mockStartWorkoutFromRoutine(...args),
  startWorkoutFromScheduledWorkout: (...args: unknown[]) => mockStartWorkoutFromScheduledWorkout(...args),
}));

// ScheduledWorkoutExerciseGroup（scheduledWorkoutId実体を持つ予定の種目一覧カード表示、
// 2026-07-20新設・2026-07-21一般化）がDB接続を必要とするuseScheduledExerciseCardsに触れないよう、
// フックレイヤーでモックする（calendar-screen.test.tsxはDBモックチェーンを組んでいない
// 画面レベルテストのため）
const mockUseScheduledExerciseCards = jest.fn();
jest.mock('@/hooks/use-scheduled-exercise-cards', () => ({
  useScheduledExerciseCards: (...args: unknown[]) => mockUseScheduledExerciseCards(...args),
}));

// ReminderScheduleExerciseGroup（未実体化のリマインダー予定プレビュー、2026-07-21）が
// DB接続を必要とするuseRoutinePreviewExerciseCardsに触れないよう、同じ理由でモックする
const mockUseRoutinePreviewExerciseCards = jest.fn();
jest.mock('@/hooks/use-routine-preview-exercise-cards', () => ({
  useRoutinePreviewExerciseCards: (...args: unknown[]) => mockUseRoutinePreviewExerciseCards(...args),
}));

const mockMaterializeReminderOccurrence = jest.fn();
jest.mock('@/lib/notifications/scheduled-workout-scheduler', () => ({
  materializeReminderOccurrence: (...args: unknown[]) => mockMaterializeReminderOccurrence(...args),
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

// ResumeWorkoutBannerはカード全体が1つのTouchableOpacityで、accessibilityLabelは
// 経過時間・ルーティン名・種目数を結合した動的な文言になる（record-tab-screen.test.tsxと同じ理由で
// 固定文言ではなくボタン内のTextの中身で検索する）
function findResumeBanner(root: ReactTestInstance) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.findAllByType(Text).some((t) => [t.props.children].flat().join('') === 'トレーニングを再開'));
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
  mockStartWorkoutFromScheduledWorkout.mockResolvedValue({ sessionId: 77, cards: [] });
  mockUseScheduledExerciseCards.mockReturnValue({ cards: [], retry: jest.fn() });
  mockUseRoutinePreviewExerciseCards.mockReturnValue({ exercises: [], loaded: true });
  mockMaterializeReminderOccurrence.mockResolvedValue({ scheduledWorkoutId: 99, notificationSuppressed: true });
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
    const resumeBtn = findResumeBanner(root)!;
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

  // 今日すでに完了済みの記録がある場合、一覧末尾を「予定を追加」だけにせず「トレーニングを
  // 開始」（もう1本）も併せて表示する（@ユーザー指摘。1日複数回トレーニングする分割法・
  // 朝晩トレユーザーの導線として、「予定を追加」（同日後刻の予定+リマインダー）は
  // @designer指摘により残したまま併存させる方針で確定）
  test('今日すでに完了済みの記録がある場合、一覧末尾に「トレーニングを開始」ボタンが「予定を追加」と併せて表示され、押すとstart-chooserへ遷移する', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 1,
          name: 'ベンチプレス',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 1,
          sessionStartedAt: Date.now(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    const root = render();

    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')).toBeDefined();
    const startBtn = root
      .findAllByType(TouchableOpacity)
      .find((t) => t.props.accessibilityLabel === 'トレーニングを開始')!;
    expect(startBtn).toBeDefined();
    act(() => {
      startBtn.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/workout/start-chooser');
  });

  test('今日すでに完了済みの記録があっても、今日中の未実施の予定（自分自身に「開始」ボタンを持つ）が残っている間は末尾の「トレーニングを開始」ボタンを表示しない（似た見た目の開始系ボタンが2つ並ぶ紛らわしさを避ける、@designer指摘）', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 1,
          name: '朝の実績種目',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 1,
          sessionStartedAt: Date.now(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    mockUseCalendarDayManualSchedule.mockReturnValue([
      { scheduledWorkoutId: 1, routineId: 20, title: '夜の予定', categories: ['leg'], exerciseCount: 3, hour: 19, minute: 30 },
    ]);
    const root = render();

    expect(
      root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '「夜の予定」夜 19:30のトレーニングを開始'),
    ).toBeDefined();
    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'トレーニングを開始')).toBeUndefined();
    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')).toBeDefined();
  });

  test('今日すでに完了済みの記録があっても、進行中セッションがある間は「トレーニングを開始」ボタンを表示しない（ResumeWorkoutBannerと開始系CTAが並ぶ紛らわしさを避ける、@designer指摘）', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 1,
          name: 'ベンチプレス',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 1,
          sessionStartedAt: Date.now(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    mockUseWorkoutSessions.mockReturnValue({
      sessions: [{ id: 9, startedAt: 0, endedAt: null }],
      activeSession: { id: 9, startedAt: 0, endedAt: null },
    });
    const root = render();

    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'トレーニングを開始')).toBeUndefined();
  });

  test('今日、完了済みの記録は無く予定だけがある場合は、従来通り「予定を追加」のみで「トレーニングを開始」は表示しない（判定がtodayTimeline全体ではなく完了記録の有無であることの確認、@reviewer指摘）', () => {
    mockUseCalendarDayManualSchedule.mockReturnValue([
      { scheduledWorkoutId: 1, routineId: 20, title: '脚の日', categories: ['leg'], exerciseCount: 3, hour: 19, minute: 30 },
    ]);
    const root = render();

    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === '予定を追加')).toBeDefined();
    expect(root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'トレーニングを開始')).toBeUndefined();
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

  // 過去日パネルの種目カードと同じく記録編集画面へ遷移する（2026-07-21、@ユーザー指摘。
  // 当初は今日パネルを種目詳細のまま維持していたが、未来予定の種目カードも記録編集画面に
  // 統一したため一貫性のため今日パネルも合わせた）
  test('今日パネルの種目カードをタップすると、種目詳細ではなく記録編集画面(/workout/{sessionId})へ遷移する', () => {
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [card({ workoutSessionExerciseId: 1, exerciseId: 10, sessionId: 77 })],
      retry: jest.fn(),
    });
    const root = render();

    const cardBtn = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel?.startsWith('ベンチプレス'))!;
    act(() => {
      cardBtn.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/workout/77');
    expect(mockPush).not.toHaveBeenCalledWith('/exercise/10');
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
      title: '胸の日',
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

  test('今日、実績が無く予定だけある場合、予定カードに時間帯見出し「夜 HH:MM」と開始ボタンが表示される', () => {
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();

    expect(root.findByProps({ children: '胸の日' })).toBeDefined();
    expect(findTextByJoinedChildren(root, '夜 20:00')).toBeDefined();
    expect(root.findAllByProps({ children: '開始' }).length).toBeGreaterThan(0);
  });

  // 2026-07-21、ルーティン予定を直接予定と同じ種目カード一覧表示に統一したことで、
  // 予定エントリもScheduleExerciseCardGroup(SessionTimeGroupHeaderを内包)を使うようになり、
  // 直接予定と同じく常に「予定」ピルが付くようになった（旧PR10-4の「二重表示回避のため出さない」
  // という制約は、旧RoutineScheduleCardが自前の時刻バッジを持っていたことに起因しており、
  // 統一後は不要になった）
  test('今日、予定カードには「予定」ラベルの見出しが付く（直接予定と同じSessionTimeGroupHeaderを使うため）', () => {
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();
    expect(findTextByJoinedChildren(root, '予定')).toBeDefined();
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
    expect(findTextByJoinedChildren(root, '夜 20:00')).toBeDefined();

    const allTexts = root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    const morningIndex = allTexts.indexOf('朝 07:10');
    const scheduleTimeIndex = allTexts.indexOf('夜 20:00');
    expect(scheduleTimeIndex).toBeGreaterThan(morningIndex);
  });

  test('今日、進行中セッションがあり予定もある場合、再開バナーと予定カードの両方が表示される', () => {
    mockUseWorkoutSessions.mockReturnValue({
      sessions: [{ id: 9, startedAt: 0, endedAt: null }],
      activeSession: { id: 9, startedAt: 0, endedAt: null },
    });
    mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
    const root = render();

    expect(findResumeBanner(root)).toBeDefined();
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
      pathname: '/calendar/schedule-chooser',
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

  // 過去日パネルの種目カードは種目詳細ではなく記録編集画面へ遷移する（2026-07-20、要件確認済み。
  // 今日パネルの種目カードは対象外で従来通り種目詳細（/exercise/{id}）のまま）
  test('過去日の種目カードをタップすると、種目詳細ではなくそのセッションの記録編集画面(/workout/{sessionId})へ遷移する', () => {
    const root = render();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 10,
          name: 'ベンチプレス',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 77,
          sessionStartedAt: past.getTime(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    selectDate(past);

    const card = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel?.startsWith('ベンチプレス'))!;
    expect(card).toBeDefined();
    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/workout/77');
    expect(mockPush).not.toHaveBeenCalledWith('/exercise/10');
  });

  // @tester指摘: 過去日に複数セッションがある場合、別グループのsessionIdへ誤爆しないことの確認
  test('過去日に複数セッションがある場合、各グループの種目カードは自分のセッションIDへ遷移する', () => {
    const root = render();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    mockUseCalendarDayExercises.mockReturnValue({
      cards: [
        {
          workoutSessionExerciseId: 1,
          exerciseId: 10,
          name: '朝の種目',
          category: 'chest',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'bench-press',
          sessionId: 77,
          sessionStartedAt: new Date(past.getFullYear(), past.getMonth(), past.getDate(), 7, 0).getTime(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
        {
          workoutSessionExerciseId: 2,
          exerciseId: 20,
          name: '夜の種目',
          category: 'leg',
          measurementType: 'weight_reps',
          source: 'preset',
          slug: 'squat',
          sessionId: 88,
          sessionStartedAt: new Date(past.getFullYear(), past.getMonth(), past.getDate(), 20, 0).getTime(),
          isBest: false,
          comparison: null,
          sets: [{ weight: 80, reps: 5, durationSeconds: null, distanceMeters: null, completedAt: 1 }],
        },
      ],
      retry: jest.fn(),
    });
    selectDate(past);

    const morningCard = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel?.startsWith('朝の種目'))!;
    act(() => {
      morningCard.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/workout/77');

    mockPush.mockClear();

    const nightCard = root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel?.startsWith('夜の種目'))!;
    act(() => {
      nightCard.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/workout/88');
  });

  describe('手動で追加した予定(PR10)', () => {
    function manualCard(overrides: Record<string, unknown> = {}) {
      return {
        scheduledWorkoutId: 1,
        routineId: 20,
        title: '脚の日',
        categories: ['leg'],
        exerciseCount: 3,
        hour: 19,
        minute: 30,
        ...overrides,
      };
    }

    // 2026-07-21、予定エントリは直接予定と同じSessionTimeGroupHeader（時間帯ラベル+時刻）を
    // 使うよう統一されたため、手動予定・リマインダー予定どちらも同じ表記になる
    // （旧「HH:MMの素の表記」というリマインダー予定との差別化は無くなった）
    test('未来日に手動予定があれば表示され、時間帯見出し「夜 HH:MM」が付く', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard()]);
      selectDate(future);

      expect(root.findByProps({ children: '脚の日' })).toBeDefined();
      expect(findTextByJoinedChildren(root, '夜 19:30')).toBeDefined();
    });

    test('同じルーティンがリマインダー予定・手動予定の両方にある場合、手動予定だけが表示される（重複排除）', () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 20, title: '脚の日' })]));
      mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, title: '脚の日' })]);
      selectDate(future);

      // 「脚の日」の予定カードは1枚だけ（重複表示されない）。dedupeが効いていなければ
      // リマインダー側・手動側の両方の見出しに「脚の日」が二重表示されてしまう
      // （2026-07-22、⋮メニュー廃止に伴いメニュー数ではなくルーティン名テキストの出現数で
      // 存在確認する。findAllByProps({children:...})はTextの内部ホスト要素まで二重にマッチする
      // ため使わず、findAllByType(Text)でTextコンポーネント単位に数える）
      const nameTexts = root.findAllByType(Text).filter((t) => [t.props.children].flat().join('') === '脚の日');
      expect(nameTexts.length).toBe(1);
      expect(findTextByJoinedChildren(root, '夜 19:30')).toBeDefined();
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
        pathname: '/calendar/schedule-chooser',
        params: { dateKey: expectedDateKey },
      });
    });

    test('未来日の「直接追加」予定（routineId===null）は種目一覧カードで表示され、種目カードをタップすると種目編集画面へ遷移する（2026-07-20、@ユーザー指摘で過去の記録と同じ種目カード表示に変更）', async () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockUseCalendarDayManualSchedule.mockReturnValue([
        manualCard({ scheduledWorkoutId: 5, routineId: null, title: 'ベンチプレス 他1種目' }),
      ]);
      mockUseScheduledExerciseCards.mockReturnValue({
        cards: [
          {
            scheduledWorkoutExerciseId: 100,
            exerciseId: 10,
            name: 'ベンチプレス',
            category: 'chest',
            source: 'preset',
            slug: 'bench_press',
            measurementType: 'weight_reps',
            sets: [],
          },
        ],
        retry: jest.fn(),
      });
      selectDate(future);

      const exerciseCard = root
        .findAllByType(TouchableOpacity)
        .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
      act(() => {
        exerciseCard.props.onPress();
      });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: '5' },
      });
    });

    describe('予定カードは全種別で⋮メニューを持たない(2026-07-22)', () => {
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

      // 削除は遷移先の目標セット編集画面(schedule-workout-edit.tsx)自身の⋮に一本化され、
      // 「今回だけ差し替え」機能自体も廃止されたため（@ユーザー指摘、2026-07-22）、手動予定カード
      // （ルーティン予定・直接予定とも）・リマインダー予定（未実体化）のいずれも⋮メニュー自体を
      // 持たない
      test('手動予定カード（ルーティン予定・直接予定とも）・リマインダー予定のどれにも⋮メニューは表示されない', () => {
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 5);
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 10, title: '胸の日' })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([
          manualCard({ routineId: 20, title: '脚の日' }),
          manualCard({ scheduledWorkoutId: 5, routineId: null, title: 'ベンチプレス 他1種目', hour: 20, minute: 0 }),
        ]);
        selectDate(future);

        expect(findMenuTrigger(root, '脚の日')).toBeUndefined();
        expect(findMenuTrigger(root, 'ベンチプレス 他1種目')).toBeUndefined();
        expect(findMenuTrigger(root, '胸の日')).toBeUndefined();
        expect(findAllMenuTriggers(root).length).toBe(0);
      });

      test('複数の手動予定が混在しても、どちらも⋮メニューは表示されない（useLiveQueryの再購読をモック更新+再選択で模擬しても崩れない）', () => {
        function secondManualCard() {
          return manualCard({ scheduledWorkoutId: 2, routineId: 21, title: '背中の日', hour: 20, minute: 0 });
        }
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 5);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard(), secondManualCard()]);
        selectDate(future);
        expect(root.findByProps({ children: '脚の日' })).toBeDefined();
        expect(root.findByProps({ children: '背中の日' })).toBeDefined();
        expect(findAllMenuTriggers(root).length).toBe(0);

        // 「脚の日」(id=1)だけ削除された後の状態をモックに反映。selectedDateは同じ日でも
        // 新しいDateインスタンスで渡さないと、setStateが同一参照とみなして再レンダーされない
        mockUseCalendarDayManualSchedule.mockReturnValue([secondManualCard()]);
        selectDate(new Date(future));

        expect(root.findAllByProps({ children: '脚の日' }).length).toBe(0);
        expect(root.findByProps({ children: '背中の日' })).toBeDefined();
      });

      test('今日自身の手動予定も選択日パネルに表示され、時間帯見出し「夜 HH:MM」が出るが⋮メニューは無い（PR10-4、選択日が今日になった瞬間消えていたバグの修正）', () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ title: '今日だけの脚の日', hour: 19, minute: 30 })]);
        const root = render();
        // selectDateしない=今日が選択されたまま

        expect(root.findByProps({ children: '今日だけの脚の日' })).toBeDefined();
        expect(findTextByJoinedChildren(root, '夜 19:30')).toBeDefined();
        expect(findMenuTrigger(root, '今日だけの脚の日')).toBeUndefined();
      });

      // 2026-07-21、手動追加のルーティン予定（実体化済み、scheduledWorkoutIdを持つ）の「開始」は
      // ルーティン本体(startWorkoutFromRoutine)ではなく、この予定インスタンス専用にコピーされた
      // 目標セット(startWorkoutFromScheduledWorkout)から開始するよう変更した。ルーティン本体から
      // 開始すると、schedule-workout-edit.tsxで編集した目標セットが「開始」に反映されない
      // バグになるため（@ユーザー指摘、計画時点の想定から意図的に変更）
      test('今日自身の手動予定にも「開始」ボタンが表示され、押すとstartWorkoutFromScheduledWorkoutがscheduledWorkoutIdで呼ばれる（編集画面で変更した目標セットを反映するため、ルーティン本体からは開始しない）', async () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ scheduledWorkoutId: 1, routineId: 20, title: '今日だけの脚の日' })]);
        const root = render();

        const startBtn = root
          .findAllByType(TouchableOpacity)
          .find((t) => t.props.accessibilityLabel === '「今日だけの脚の日」夜 19:30のトレーニングを開始')!;
        await act(async () => {
          await startBtn.props.onPress();
        });

        expect(mockStartWorkoutFromScheduledWorkout).toHaveBeenCalledWith(1);
        expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/workout/77');
      });

      test('今日の「直接追加」予定（routineId===null）にも「開始」ボタンが表示され、押すとstartWorkoutFromScheduledWorkoutがscheduledWorkoutIdで呼ばれる（2026-07-20）', async () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([
          manualCard({ scheduledWorkoutId: 5, routineId: null, title: 'ベンチプレス 他2種目' }),
        ]);
        const root = render();

        const startBtn = root
          .findAllByType(TouchableOpacity)
          .find((t) => t.props.accessibilityLabel === '「ベンチプレス 他2種目」夜 19:30のトレーニングを開始')!;
        await act(async () => {
          await startBtn.props.onPress();
        });

        expect(mockStartWorkoutFromScheduledWorkout).toHaveBeenCalledWith(5);
        expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/workout/77');
      });

      test('今日、直接追加予定は種目一覧カードで表示され、種目カードをタップすると種目編集画面へ遷移する（2026-07-20、@ユーザー指摘で過去の記録と同じ種目カード表示に変更）', () => {
        mockUseCalendarDayManualSchedule.mockReturnValue([
          manualCard({ scheduledWorkoutId: 5, routineId: null, title: 'ベンチプレス 他1種目' }),
        ]);
        mockUseScheduledExerciseCards.mockReturnValue({
          cards: [
            {
              scheduledWorkoutExerciseId: 100,
              exerciseId: 10,
              name: 'ベンチプレス',
              category: 'chest',
              source: 'preset',
              slug: 'bench_press',
              measurementType: 'weight_reps',
              sets: [],
            },
          ],
          retry: jest.fn(),
        });
        const root = render();

        const exerciseCard = root
          .findAllByType(TouchableOpacity)
          .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
        act(() => {
          exerciseCard.props.onPress();
        });

        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/calendar/schedule-workout-edit',
          params: { scheduledWorkoutId: '5' },
        });
      });

      test('今日、同じルーティンがリマインダー予定・手動予定の両方にある場合、手動予定だけが表示される（未来日と同じdedupeを今日にも適用、PR10-4）', () => {
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 20, title: '脚の日' })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 20, title: '脚の日' })]);
        const root = render();

        // dedupeが効いていなければリマインダー側・手動側の両方の見出しに「脚の日」が
        // 二重表示されてしまう（2026-07-22、⋮メニュー廃止に伴いメニュー数ではなく
        // ルーティン名テキストの出現数で存在確認する。findAllByProps({children:...})は
        // Textの内部ホスト要素まで二重にマッチするため使わない）
        const nameTexts = root.findAllByType(Text).filter((t) => [t.props.children].flat().join('') === '脚の日');
        expect(nameTexts.length).toBe(1);
        expect(findTextByJoinedChildren(root, '夜 19:30')).toBeDefined();
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
          pathname: '/calendar/schedule-chooser',
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
        mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 10, title: '朝の予定', hour: 7, minute: 0 })]));
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ routineId: 21, title: '夜の手動予定', hour: 19, minute: 30 })]);
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
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ title: '進行中と併存する脚の日' })]);
        const root = render();

        expect(findResumeBanner(root)).toBeDefined();
        expect(root.findByProps({ children: '進行中と併存する脚の日' })).toBeDefined();
      });

      test('未来日で手動予定を表示した状態から選択日を今日に戻しても、手動予定が消えない（選択日が今日になった瞬間に消えていたバグの回帰、PR10-4の本来の目的）', () => {
        const root = render();
        const future = new Date();
        future.setDate(future.getDate() + 3);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ title: '往復テストの脚の日' })]);

        selectDate(future);
        expect(root.findByProps({ children: '往復テストの脚の日' })).toBeDefined();

        selectDate(new Date());
        expect(root.findByProps({ children: '往復テストの脚の日' })).toBeDefined();
      });

      test('過去日を選択した後に選択日を今日に戻すと、手動予定が再表示される', () => {
        const root = render();
        const past = new Date();
        past.setDate(past.getDate() - 3);
        mockUseCalendarDayManualSchedule.mockReturnValue([manualCard({ title: '往復テストの脚の日2' })]);
        mockUseCalendarDayExercises.mockReturnValue({ cards: [], retry: jest.fn() });

        selectDate(past);
        expect(root.findAllByProps({ children: '往復テストの脚の日2' }).length).toBe(0);

        selectDate(new Date());
        expect(root.findByProps({ children: '往復テストの脚の日2' })).toBeDefined();
      });
    });
  });

  describe('今日の予定カードの「開始」ボタン(handleStartRoutine)', () => {
    function findStartButton(root: ReactTestInstance) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => t.props.accessibilityLabel === '「胸の日」夜 20:00のトレーニングを開始')!;
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

  // リマインダー由来の未実体化予定（ReminderScheduleExerciseGroup）の種目カードタップ用
  // （2026-07-21）。まだscheduledWorkouts行が存在しないため、初めてこの日付・時刻の実体を
  // 作ってから種目編集画面へ遷移する（handleMaterializeAndEditRoutineSchedule）
  describe('リマインダー予定の種目カードタップ→実体化(materializeReminderOccurrence)', () => {
    function mockRoutinePreviewWithExercise() {
      mockUseRoutinePreviewExerciseCards.mockReturnValue({
        exercises: [
          {
            routineExerciseId: 100,
            exerciseId: 10,
            name: 'ベンチプレス',
            category: 'chest',
            source: 'preset',
            slug: 'bench_press',
            measurementType: 'weight_reps',
            sets: [{ id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
          },
        ],
        loaded: true,
      });
    }

    function findExerciseCard(root: ReactTestInstance) {
      return root
        .findAllByType(TouchableOpacity)
        .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel.startsWith('ベンチプレス、'))!;
    }

    test('未実体化のリマインダー予定の種目カードをタップすると、reminderId/routineId/routineName/選択日のdateKey/hour/minuteでmaterializeReminderOccurrenceを呼び、成功したらschedule-workout-editへ遷移する', async () => {
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      mockMaterializeReminderOccurrence.mockResolvedValue({ scheduledWorkoutId: 55, notificationSuppressed: true });
      const root = render();

      await act(async () => {
        await findExerciseCard(root).props.onPress();
      });

      expect(mockMaterializeReminderOccurrence).toHaveBeenCalledWith(1, 10, '胸の日', toDateKey(new Date()), 20, 0);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: '55' },
      });
    });

    test('notificationSuppressed:falseの場合、遷移前に警告Alertを出し、OKを押してから遷移する（通知登録失敗を無言にしない扱い）', async () => {
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      mockMaterializeReminderOccurrence.mockResolvedValue({ scheduledWorkoutId: 55, notificationSuppressed: false });
      const root = render();

      await act(async () => {
        await findExerciseCard(root).props.onPress();
      });

      expect(mockPush).not.toHaveBeenCalled();
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      expect(alertCall[0]).toBe('予定を開きました');
      await act(async () => {
        await alertCall[2][0].onPress();
      });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: '55' },
      });
    });

    test('materializeReminderOccurrenceが失敗した場合はエラーAlertを表示し、遷移しない', async () => {
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      mockMaterializeReminderOccurrence.mockRejectedValueOnce(new Error('fail'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const root = render();

      await act(async () => {
        await findExerciseCard(root).props.onPress();
      });

      expect(Alert.alert).toHaveBeenCalledWith('エラー', '予定を開けませんでした。');
      expect(mockPush).not.toHaveBeenCalled();
    });

    test('二重タップ防止: 実行中に同じ種目カードを連打しても、materializeReminderOccurrenceは1回しか呼ばれない', async () => {
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      let resolveMaterialize!: (v: { scheduledWorkoutId: number; notificationSuppressed: boolean }) => void;
      mockMaterializeReminderOccurrence.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMaterialize = resolve;
          }),
      );
      const root = render();
      const card = findExerciseCard(root);

      act(() => {
        card.props.onPress();
        card.props.onPress();
      });
      expect(mockMaterializeReminderOccurrence).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveMaterialize({ scheduledWorkoutId: 55, notificationSuppressed: true });
        await Promise.resolve();
      });
    });

    // ここまでは今日パネル側のみのテスト。未来日パネルも同じhandleMaterializeAndEditRoutineSchedule
    // に配線されているが、ScheduleTimelineEntryへのprops渡し間違い（コピペ時のtypo等）を
    // 拾うため、未来日側でも最低1本は実際にタップして検証しておく（@tester指摘）
    test('未来日: 未実体化のリマインダー予定の種目カードをタップすると、選択日のdateKeyでmaterializeReminderOccurrenceを呼び、成功したらschedule-workout-editへ遷移する', async () => {
      const root = render();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard()]));
      mockMaterializeReminderOccurrence.mockResolvedValue({ scheduledWorkoutId: 55, notificationSuppressed: true });
      selectDate(future);

      await act(async () => {
        await findExerciseCard(root).props.onPress();
      });

      expect(mockMaterializeReminderOccurrence).toHaveBeenCalledWith(1, 10, '胸の日', toDateKey(future), 20, 0);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/calendar/schedule-workout-edit',
        params: { scheduledWorkoutId: '55' },
      });
    });

    // 実体化後、useLiveQueryの再購読でuseCalendarDaySchedule（リマインダー由来）から消え
    // useCalendarDayManualSchedule（手動予定）に現れるという実際のDB挙動を、モック値の更新+
    // 再選択で模擬する（旧・今回だけ差し替えdescueにあった同種の結線確認が、機能削除に伴って
    // 失われていたため@tester指摘で追加、2026-07-22）
    test('実体化後、選択日パネルの表示がリマインダー予定カードから手動予定カードへ切り替わる', async () => {
      mockRoutinePreviewWithExercise();
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([scheduleCard({ routineId: 10, title: '胸の日' })]));
      mockMaterializeReminderOccurrence.mockResolvedValue({ scheduledWorkoutId: 55, notificationSuppressed: true });
      const root = render();

      await act(async () => {
        await findExerciseCard(root).props.onPress();
      });

      // 実体化成功後のDB状態を模擬: リマインダー由来のカードは消え、手動予定カードが現れる
      mockUseCalendarDaySchedule.mockReturnValue(daySchedule([]));
      mockUseCalendarDayManualSchedule.mockReturnValue([
        {
          scheduledWorkoutId: 55,
          routineId: 10,
          title: '胸の日',
          categories: ['chest'],
          exerciseCount: 1,
          hour: 20,
          minute: 0,
        },
      ]);
      selectDate(new Date());

      // 手動予定カードは開始ボタンを持つ（今日パネル）ため、その存在で手動予定側に
      // 切り替わったことを確認する
      const startBtn = root
        .findAllByType(TouchableOpacity)
        .find((t) => typeof t.props.accessibilityLabel === 'string' && t.props.accessibilityLabel === '「胸の日」夜 20:00のトレーニングを開始');
      expect(startBtn).toBeDefined();
    });
  });
});
