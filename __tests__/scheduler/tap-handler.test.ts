const mockWhere = jest.fn();
const mockGetActiveSession = jest.fn();
const mockStartWorkoutFromRoutine = jest.fn();

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: (...args: unknown[]) => mockWhere(...args),
      }),
    }),
  },
}));

jest.mock('@/db/schema', () => ({ reminders: { id: 'id', routineId: 'routineId' } }));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('@/lib/workout/session', () => ({
  getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
  startWorkoutFromRoutine: (...args: unknown[]) => mockStartWorkoutFromRoutine(...args),
}));

import { resolveReminderTapDestination } from '@/lib/notifications/tap-handler';
import type { NotificationResponse } from 'expo-notifications';

function makeResponse(data: unknown): NotificationResponse {
  return {
    notification: {
      request: {
        identifier: 'id-1',
        content: { data },
      },
    },
  } as unknown as NotificationResponse;
}

beforeEach(() => {
  mockWhere.mockReset();
  mockWhere.mockResolvedValue([]);
  mockGetActiveSession.mockReset();
  mockGetActiveSession.mockResolvedValue(null);
  mockStartWorkoutFromRoutine.mockReset();
  mockStartWorkoutFromRoutine.mockResolvedValue(null);
});

describe('resolveReminderTapDestination', () => {
  test('responseがnullなら遷移しない(DBも引かない)', async () => {
    expect(await resolveReminderTapDestination(null)).toBeNull();
    expect(mockWhere).not.toHaveBeenCalled();
  });

  test('responseがundefinedなら遷移しない', async () => {
    expect(await resolveReminderTapDestination(undefined)).toBeNull();
  });

  test('dataが無い通知（テスト通知など）は遷移しない', async () => {
    expect(await resolveReminderTapDestination(makeResponse(undefined))).toBeNull();
  });

  test('data.typeがreminder以外なら遷移しない', async () => {
    expect(await resolveReminderTapDestination(makeResponse({ type: 'other' }))).toBeNull();
  });

  test('reminderIdが欠落/非number(不正データ)なら遷移せず、DBも引かない', async () => {
    expect(await resolveReminderTapDestination(makeResponse({ type: 'reminder' }))).toBeNull();
    expect(await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: '1' }))).toBeNull();
    expect(mockWhere).not.toHaveBeenCalled();
  });

  test('単体リマインダー(routineId無し)は記録タブへの遷移を返し、ワークアウト開始は一切行わない', async () => {
    mockWhere.mockResolvedValue([{ routineId: null }]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));
    expect(route).toBe('/');
    expect(mockGetActiveSession).not.toHaveBeenCalled();
    expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
  });

  test('DBに該当リマインダーが見つからない(削除済み等)場合も記録タブへの遷移を返す', async () => {
    mockWhere.mockResolvedValue([]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));
    expect(route).toBe('/');
  });

  test('リマインダーの参照が失敗した場合、握りつぶさずそのままrejectする(呼び出し側でエラーハンドリングする契約)', async () => {
    mockWhere.mockRejectedValue(new Error('db error'));
    await expect(
      resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 })),
    ).rejects.toThrow('db error');
  });

  describe('ルーティン由来のリマインダー(routineIdあり)', () => {
    test('進行中セッションが無ければ、ルーティンからワークアウトを開始しそのセッション画面への遷移を返す', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 7, cards: [] });

      const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));

      expect(mockStartWorkoutFromRoutine).toHaveBeenCalledWith(42);
      expect(route).toBe('/workout/7');
    });

    test('startWorkoutFromRoutineが返すsessionIdが0でも正しく遷移先に使われる(truthy判定でobjectそのものを見ていることの回帰防止)', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockStartWorkoutFromRoutine.mockResolvedValue({ sessionId: 0, cards: [] });

      const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));

      expect(route).toBe('/workout/0');
    });

    test('該当ルーティンが見つからない場合(startWorkoutFromRoutineがnullを返す)は記録タブへの遷移を返す', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockStartWorkoutFromRoutine.mockResolvedValue(null);

      const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));

      expect(route).toBe('/');
    });

    test('既に別のトレーニングが進行中の場合、無言でそちらへ遷移させず記録タブへの遷移を返す(ワークアウトは新規開始しない)', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockGetActiveSession.mockResolvedValue({ id: 9, startedAt: 0, endedAt: null });

      const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));

      expect(mockStartWorkoutFromRoutine).not.toHaveBeenCalled();
      expect(route).toBe('/');
    });

    test('進行中セッションの確認が失敗した場合、握りつぶさずそのままrejectする', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockGetActiveSession.mockRejectedValue(new Error('db error'));

      await expect(
        resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 })),
      ).rejects.toThrow('db error');
    });

    test('ワークアウト開始が失敗した場合、握りつぶさずそのままrejectする', async () => {
      mockWhere.mockResolvedValue([{ routineId: 42 }]);
      mockStartWorkoutFromRoutine.mockRejectedValue(new Error('start error'));

      await expect(
        resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 })),
      ).rejects.toThrow('start error');
    });
  });
});
