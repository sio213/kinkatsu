// FK cascade等の実DB挙動はreminder-schedule-skips-integration.test.tsが担当する。ここでは
// lib/calendar/reminder-skips.tsの各関数がどのテーブルに対してどの引数で操作を発行するかを
// 検証する（lib/calendar/scheduled-workouts.tsのscheduled-workouts.test.tsと同じモック方針）
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockSelectWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockReturning = jest.fn().mockResolvedValue([{ id: 42 }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockSelectWhere = jest.fn().mockResolvedValue([]);
  return {
    db: {
      insert: jest.fn((table: unknown) => ({ values: (...args: unknown[]) => mockInsertValues(table, ...args) })),
      delete: jest.fn((table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({ where: (...args: unknown[]) => mockSelectWhere(...args) })),
      })),
    },
  };
});

jest.mock('@/db/schema', () => ({
  reminderScheduleSkips: { id: 'id', reminderId: 'reminderId', skippedDate: 'skippedDate' },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conds) => ({ conds })),
  eq: jest.fn((col, val) => ({ col, val })),
  lt: jest.fn((col, val) => ({ col, val, op: 'lt' })),
}));

import {
  addReminderScheduleSkip,
  hasReminderScheduleSkip,
  pruneExpiredReminderScheduleSkips,
  removeReminderScheduleSkip,
} from '@/lib/calendar/reminder-skips';

beforeEach(() => {
  mockInsertValues.mockClear();
  mockReturning.mockClear();
  mockDeleteWhere.mockClear();
  mockSelectWhere.mockClear();
  mockSelectWhere.mockResolvedValue([]);
});

describe('addReminderScheduleSkip', () => {
  it('reminderId/skippedDateをvaluesに渡してinsertし、挿入行のidを返す', async () => {
    const id = await addReminderScheduleSkip(1, '2026-07-27');
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ reminderId: 1, skippedDate: '2026-07-27' });
    expect(id).toBe(42);
  });
});

describe('removeReminderScheduleSkip', () => {
  it('指定したreminderId/skippedDateの組でdeleteする', async () => {
    await removeReminderScheduleSkip(1, '2026-07-27');
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe('hasReminderScheduleSkip', () => {
  it('該当する行が1件でもあればtrueを返す', async () => {
    mockSelectWhere.mockResolvedValue([{ id: 1, reminderId: 1, skippedDate: '2026-07-27' }]);
    expect(await hasReminderScheduleSkip(1, '2026-07-27')).toBe(true);
  });

  it('該当する行が無ければfalseを返す', async () => {
    mockSelectWhere.mockResolvedValue([]);
    expect(await hasReminderScheduleSkip(1, '2026-07-27')).toBe(false);
  });
});

describe('pruneExpiredReminderScheduleSkips', () => {
  it('基準日より前のskippedDateを条件にdeleteする', async () => {
    await pruneExpiredReminderScheduleSkips(new Date(2026, 6, 27));
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    const [, condition] = mockDeleteWhere.mock.calls[0];
    expect(condition).toEqual({ col: 'skippedDate', val: '2026-07-27', op: 'lt' });
  });
});
