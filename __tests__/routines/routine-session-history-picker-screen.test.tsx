const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
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
import RoutineSessionHistoryPickerScreen from '@/app/routine/session-history-picker';
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
    instance = create(React.createElement(RoutineSessionHistoryPickerScreen));
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
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('ルーティンには進行中セッションが無いため、除外セッションIDにNO_SESSION_TO_EXCLUDEを渡す', async () => {
  await renderResolved([chestSession]);
  expect(mockGetPastTrainingSessions).toHaveBeenCalledWith(NO_SESSION_TO_EXCLUDE, expect.objectContaining({ offset: 0 }));
});

test('セッションカードをタップすると/routine/session-history-loadへsourceSessionId付きで遷移する(sessionIdパラメータは不要)', async () => {
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
    pathname: '/routine/session-history-load',
    params: { sourceSessionId: '1', sourceStartedAt: String(chestSession.startedAt) },
  });
});
