// FK cascade等の実DB挙動はscheduled-workouts-integration.test.tsが担当する。ここでは
// lib/calendar/scheduled-workouts.tsの各関数がどのテーブルに対してどの引数で操作を発行するかを
// 検証する（lib/routines/db.tsのdb.test.tsと同じモック方針）
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockDeleteWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockReturning = jest.fn().mockResolvedValue([{ id: 42 }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  return {
    db: {
      insert: jest.fn((table: unknown) => ({ values: (...args: unknown[]) => mockInsertValues(table, ...args) })),
      delete: jest.fn((table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) })),
    },
  };
});

jest.mock('@/db/schema', () => ({
  scheduledWorkouts: { id: 'id', routineId: 'routineId', scheduledDate: 'scheduledDate' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

import { addScheduledWorkout, deleteScheduledWorkout } from '@/lib/calendar/scheduled-workouts';

beforeEach(() => {
  mockInsertValues.mockClear();
  mockReturning.mockClear();
  mockDeleteWhere.mockClear();
});

describe('addScheduledWorkout', () => {
  it('routineId/scheduledDate/hour/minuteをvaluesに渡してinsertし、挿入行のidを返す', async () => {
    const id = await addScheduledWorkout(10, '2026-07-25', 19, 30);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 });
    expect(id).toBe(42);
  });

  it('hour/minuteの境界値(0, 23, 59)はinsertされる', async () => {
    await addScheduledWorkout(10, '2026-07-25', 0, 0);
    await addScheduledWorkout(10, '2026-07-25', 23, 59);
    expect(mockInsertValues).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['hour=24(範囲外)', 24, 0],
    ['hour=-1(範囲外)', -1, 0],
    ['minute=60(範囲外)', 19, 60],
    ['minute=-1(範囲外)', 19, -1],
  ])('%s はinsertを呼ばず例外を投げる', async (_label, hour, minute) => {
    await expect(addScheduledWorkout(10, '2026-07-25', hour, minute)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe('deleteScheduledWorkout', () => {
  it('指定したidでdeleteする', async () => {
    await deleteScheduledWorkout(42);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
