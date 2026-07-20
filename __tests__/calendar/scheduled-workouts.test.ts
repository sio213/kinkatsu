// FK cascade等の実DB挙動はscheduled-workouts-integration.test.tsが担当する。ここでは
// lib/calendar/scheduled-workouts.tsの各関数がどのテーブルに対してどの引数で操作を発行するかを
// 検証する（lib/routines/db.tsのdb.test.tsと同じモック方針）
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockReturning = jest.fn().mockResolvedValue([{ id: 42 }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn((table: unknown, ...args: unknown[]) => ({
    where: (...whereArgs: unknown[]) => mockUpdateWhere(table, ...args, ...whereArgs),
  }));

  // scheduledWorkoutExercisesへのinsertは.returning()を呼ばず.values()の戻り値を直接awaitする
  // （idを使わないため）。mockInsertValuesのデフォルト戻り値は非Promiseのプレーンオブジェクトだが、
  // awaitは非thenable値をそのまま解決するため問題なく動く
  const tx = {
    insert: jest.fn((table: unknown) => ({
      values: (...args: unknown[]) => mockInsertValues(table, ...args),
    })),
    delete: jest.fn((table: unknown) => ({
      where: (...args: unknown[]) => mockDeleteWhere(table, ...args),
    })),
    update: jest.fn((table: unknown) => ({
      set: (...args: unknown[]) => mockUpdateSet(table, ...args),
    })),
  };

  return {
    db: {
      insert: jest.fn((table: unknown) => ({ values: (...args: unknown[]) => mockInsertValues(table, ...args) })),
      delete: jest.fn((table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) })),
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  scheduledWorkouts: { id: 'id', routineId: 'routineId', scheduledDate: 'scheduledDate' },
  scheduledWorkoutExercises: { id: 'id', scheduledWorkoutId: 'scheduledWorkoutId', exerciseId: 'exerciseId' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

import {
  addDirectScheduledWorkout,
  addScheduledWorkout,
  deleteScheduledWorkout,
  updateScheduledWorkoutExercises,
} from '@/lib/calendar/scheduled-workouts';

beforeEach(() => {
  mockInsertValues.mockClear();
  mockReturning.mockClear();
  mockDeleteWhere.mockClear();
  mockUpdateSet.mockClear();
  mockUpdateWhere.mockClear();
  // scheduledWorkoutExercisesへのinsertは.values()の戻り値が直接awaitされるため、
  // デフォルトでresolveするPromiseにしておく（addDirectScheduledWorkoutのテスト用）
  mockInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
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

// 「直接追加」（ルーティンを介さず個別に選んだ種目で予定を作る、2026-07-20）
describe('addDirectScheduledWorkout', () => {
  it('routineId:nullでscheduledWorkoutsをinsertし、返ったidで各exerciseIdをorderIndex付きでscheduledWorkoutExercisesへinsertする', async () => {
    const id = await addDirectScheduledWorkout([5, 8, 3], '2026-07-25', 19, 30);

    expect(mockInsertValues).toHaveBeenCalledTimes(2);
    const [, scheduledWorkoutValues] = mockInsertValues.mock.calls[0];
    expect(scheduledWorkoutValues).toMatchObject({
      routineId: null,
      scheduledDate: '2026-07-25',
      hour: 19,
      minute: 30,
    });

    const [, exerciseValues] = mockInsertValues.mock.calls[1];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 5, orderIndex: 0 }),
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 8, orderIndex: 1 }),
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 3, orderIndex: 2 }),
    ]);
    expect(id).toBe(42);
  });

  it('exerciseIdsが空の場合はinsertを呼ばず例外を投げる', async () => {
    await expect(addDirectScheduledWorkout([], '2026-07-25', 19, 30)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it.each([
    ['hour=24(範囲外)', 24, 0],
    ['minute=60(範囲外)', 19, 60],
  ])('%s はinsertを呼ばず例外を投げる', async (_label, hour, minute) => {
    await expect(addDirectScheduledWorkout([1], '2026-07-25', hour, minute)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// 直接予定の種目一覧をまとめて編集する画面（schedule-exercise-picker.tsxの編集モード、2026-07-20）用
describe('updateScheduledWorkoutExercises', () => {
  it('既存のscheduledWorkoutExercisesを削除してから、新しい選択順でinsertし直し、scheduledWorkoutsのupdatedAtも更新する', async () => {
    await updateScheduledWorkoutExercises(5, [8, 3]);

    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 5, exerciseId: 8, orderIndex: 0 }),
      expect.objectContaining({ scheduledWorkoutId: 5, exerciseId: 3, orderIndex: 1 }),
    ]);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('exerciseIdsが空の場合は削除・insert・updateのいずれも呼ばず例外を投げる', async () => {
    await expect(updateScheduledWorkoutExercises(5, [])).rejects.toThrow();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});

describe('deleteScheduledWorkout', () => {
  it('指定したidでdeleteする', async () => {
    await deleteScheduledWorkout(42);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
