const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => unknown } }) =>
      options?.headerTitle ? options.headerTitle() : null,
  },
}));

// lib/workout/history.tsはトップレベルで@/db/client(expo-sqlite依存)を読み込むため、
// session-history-picker-screen.test.tsxと同じ理由でdb/client等は最小限モックする
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/schema', () => ({
  exercises: {},
  sets: {},
  workoutSessionExercises: {},
  workoutSessions: {},
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
  ne: jest.fn(),
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import ScheduleWorkoutHistoryPickerScreen from '@/app/calendar/schedule-workout-history-picker';
import * as historyModule from '@/lib/workout/history';
import { NO_SESSION_TO_EXCLUDE, type PastTrainingSession } from '@/lib/workout/history';

const mockGetPastTrainingSessions = jest.spyOn(historyModule, 'getPastTrainingSessions');

const chestSession: PastTrainingSession = {
  sessionId: 1,
  startedAt: new Date(2026, 6, 5, 10, 0).getTime(),
  exercises: [{ exerciseId: 10, name: 'ベンチプレス', category: 'chest' }],
};

function render() {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ScheduleWorkoutHistoryPickerScreen));
  });
  return instance.root;
}

async function renderResolved(sessions: PastTrainingSession[]) {
  mockGetPastTrainingSessions.mockResolvedValue({ sessions, hasMore: false });
  const root = render();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: '5' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ヘッダー⋮「過去の記録から読み込む」フローの画面2。app/workout/session-history-picker.tsxの
// カレンダー版（2026-07-21新設）。この予定には進行中セッションの概念が無いため、
// app/routine/session-history-picker.tsxと同じくNO_SESSION_TO_EXCLUDEを渡す
describe('ScheduleWorkoutHistoryPickerScreen', () => {
  test('scheduledWorkoutIdが不正(NaN)な場合は「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ scheduledWorkoutId: 'abc' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
  });

  test('この予定には進行中セッションが無いため、除外セッションIDにNO_SESSION_TO_EXCLUDEを渡す', async () => {
    await renderResolved([chestSession]);
    expect(mockGetPastTrainingSessions).toHaveBeenCalledWith(NO_SESSION_TO_EXCLUDE, expect.objectContaining({ offset: 0 }));
  });

  test('セッションカードをタップするとschedule-workout-history-loadへscheduledWorkoutId・sourceSessionId付きで遷移する', async () => {
    const root = await renderResolved([chestSession]);
    const card = root
      .findAllByType(TouchableOpacity)
      .find(
        (btn: ReactTestInstance) =>
          typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes('ベンチプレス'),
      )!;

    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-history-load',
      params: { scheduledWorkoutId: '5', sourceSessionId: '1', sourceStartedAt: String(chestSession.startedAt) },
    });
  });
});

// 「予定を追加」→「過去の記録」経路（2026-07-25新設）。予定がまだ存在しないため
// scheduledWorkoutIdの代わりにdateKeyが渡り、選んだセッションはそのまま画面3へ引き継がれる
describe('dateKeyモード（新規予定の作成経路）', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-07-25' });
  });

  test('scheduledWorkoutIdが無くても「見つかりません」画面にはならない', async () => {
    const root = await renderResolved([chestSession]);
    expect(() => root.findByProps({ children: '予定が見つかりません' })).toThrow();
  });

  test('対象日をヘッダーのサブタイトルに表示する（@designer指摘: 選択中に日付を見失わないため）', async () => {
    const root = await renderResolved([chestSession]);
    expect(root.findByProps({ children: '過去の記録' })).toBeDefined();
    expect(root.findByProps({ children: '7月25日（土）' })).toBeDefined();
  });

  test('セッションカードをタップするとdateKey付きでschedule-workout-history-loadへ遷移する', async () => {
    const root = await renderResolved([chestSession]);
    const card = root
      .findAllByType(TouchableOpacity)
      .find(
        (btn: ReactTestInstance) =>
          typeof btn.props.accessibilityLabel === 'string' && btn.props.accessibilityLabel.includes('ベンチプレス'),
      )!;

    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/calendar/schedule-workout-history-load',
      params: { dateKey: '2026-07-25', sourceSessionId: '1', sourceStartedAt: String(chestSession.startedAt) },
    });
  });

  test('不正なdateKeyだけが渡った場合は「見つかりません」画面になる', () => {
    mockUseLocalSearchParams.mockReturnValue({ dateKey: '2026-13-99' });
    const root = render();
    expect(root.findByProps({ children: '予定が見つかりません' })).toBeDefined();
  });
});
