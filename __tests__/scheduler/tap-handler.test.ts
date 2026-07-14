const mockWhere = jest.fn();

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

  test('routineId===0(将来DBのid採番が0始まりになった場合の回帰防止。!= nullで正しくルーティン扱いされる)', async () => {
    mockWhere.mockResolvedValue([{ routineId: 0 }]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));
    expect(route).toBe('/routine/edit/0');
  });

  test('DBクエリが失敗した場合、握りつぶさずそのままrejectする(呼び出し側でエラーハンドリングする契約)', async () => {
    mockWhere.mockRejectedValue(new Error('db error'));
    await expect(
      resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 })),
    ).rejects.toThrow('db error');
  });

  test('単体リマインダー(routineId無し)は記録タブへの遷移を返す', async () => {
    mockWhere.mockResolvedValue([{ routineId: null }]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));
    expect(route).toBe('/');
  });

  test('DBに該当リマインダーが見つからない(削除済み等)場合も記録タブへの遷移を返す', async () => {
    mockWhere.mockResolvedValue([]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 1 }));
    expect(route).toBe('/');
  });

  test('ルーティン由来のリマインダー(routineIdあり)はルーティン編集画面への遷移を返す', async () => {
    mockWhere.mockResolvedValue([{ routineId: 42 }]);
    const route = await resolveReminderTapDestination(makeResponse({ type: 'reminder', reminderId: 7 }));
    expect(route).toBe('/routine/edit/42');
  });
});
