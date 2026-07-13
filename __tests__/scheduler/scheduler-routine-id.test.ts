// createReminder/updateReminderがroutineIdを正しく永続化するかどうかを検証する。
// 日付計算等の純粋関数はscheduler.test.tsが担当するため、ここではDBへ渡す行の中身のみを見る。
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockSelectWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockReturning = jest.fn();
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockSelectWhere = jest.fn().mockResolvedValue([]);

  return {
    db: {
      insert: jest.fn((table: unknown) => ({
        values: (...args: unknown[]) => mockInsertValues(table, ...args),
      })),
      update: jest.fn((table: unknown) => ({
        set: (...args: unknown[]) => mockUpdateSet(table, ...args),
      })),
      delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({ where: (...args: unknown[]) => mockSelectWhere(...args) })),
      })),
    },
  };
});
jest.mock('@/db/schema', () => ({
  reminders: { id: 'reminders.id', routineId: 'reminders.routineId' },
  reminderNotifications: {},
}));
jest.mock('drizzle-orm', () => ({ and: jest.fn(), eq: jest.fn(), gt: jest.fn(), lte: jest.fn() }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('os-id-1'),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
}));
jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import { createReminder, updateReminder } from '@/lib/notifications/scheduler';
import type { ReminderInput } from '@/lib/notifications/types';

function makeInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'interval',
    hour: 18,
    minute: 0,
    intervalDays: 1,
    enabled: false, // enabled:falseにしてscheduleReminder(OS登録)の分岐を素通りさせる
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 1, enabled: false }]);
  mockInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockUpdateWhere.mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockSelectWhere.mockResolvedValue([]);
});

test('createReminderはroutineIdが指定されればinsertする行に含める', async () => {
  await createReminder(makeInput({ routineId: 7 }));

  const [, row] = mockInsertValues.mock.calls[0];
  expect(row.routineId).toBe(7);
});

test('createReminderはroutineId未指定ならnullを保存する（単体リマインダーの既存挙動）', async () => {
  await createReminder(makeInput());

  const [, row] = mockInsertValues.mock.calls[0];
  expect(row.routineId).toBeNull();
});

test('updateReminderはroutineIdが指定されればset内容に含める', async () => {
  await updateReminder(1, makeInput({ routineId: 9 }));

  const [, payload] = mockUpdateSet.mock.calls[0];
  expect(payload.routineId).toBe(9);
});

test('updateReminderはroutineId未指定ならnullに戻す', async () => {
  await updateReminder(1, makeInput());

  const [, payload] = mockUpdateSet.mock.calls[0];
  expect(payload.routineId).toBeNull();
});

test('明示的にnullを渡した場合もnullとして保存される（buildEditInputが返す形）', async () => {
  await createReminder(makeInput({ routineId: null }));

  const [, row] = mockInsertValues.mock.calls[0];
  expect(row.routineId).toBeNull();
});
