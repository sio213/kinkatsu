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
  // .returning()の戻り値は挿入したvaluesの形（単一オブジェクト/配列）に応じて組み立てる。
  // scheduledWorkoutExercisesの複数行insertはinsertInitialScheduledWorkoutSetsが
  // `for (const row of rows)`でid・exerciseIdを参照するため、入力件数分の行を返す必要がある
  mockReturning = jest.fn((_table: unknown, values: unknown) => {
    if (Array.isArray(values)) {
      return Promise.resolve(values.map((v, i) => ({ id: 42 + i, ...(v as object) })));
    }
    return Promise.resolve([{ id: 42, ...(values as object) }]);
  });
  mockInsertValues = jest.fn((table: unknown, values: unknown) => ({
    returning: (...args: unknown[]) => mockReturning(table, values, ...args),
  }));
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn((table: unknown, ...args: unknown[]) => ({
    where: (...whereArgs: unknown[]) => mockUpdateWhere(table, ...args, ...whereArgs),
  }));

  // scheduledWorkoutSetsへのinsertは.returning()を呼ばず.values()の戻り値を直接awaitする
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
  scheduledWorkoutSets: { id: 'id', scheduledWorkoutExerciseId: 'scheduledWorkoutExerciseId' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

// addDirectScheduledWorkoutは各種目の目標セットを直近の実績からプリフィルするために
// buildInitialRoutineSetsを呼ぶ（lib/calendar/scheduled-workout-detail.tsのinsertInitialScheduledWorkoutSets
// 経由）。この関数自体の中身（getPreviousSetsの生SQL呼び出し）は__tests__/routines/db.test.tsが担当するため、
// ここでは呼び出し結果だけモックする。addScheduledWorkoutはgetRoutineDetailでルーティンの実際の
// 目標セット値を読む（2026-07-21、ルーティン予定も直接予定と同じくscheduledWorkoutExercises/
// scheduledWorkoutSetsを持つように変更）
const mockBuildInitialRoutineSets = jest.fn();
const mockGetRoutineDetail = jest.fn();
jest.mock('@/lib/routines/db', () => ({
  buildInitialRoutineSets: (...args: unknown[]) => mockBuildInitialRoutineSets(...args),
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
}));

import { addDirectScheduledWorkout, addScheduledWorkout, deleteScheduledWorkout } from '@/lib/calendar/scheduled-workouts';

beforeEach(() => {
  mockInsertValues.mockClear();
  mockReturning.mockClear();
  mockDeleteWhere.mockClear();
  mockUpdateSet.mockClear();
  mockUpdateWhere.mockClear();
  mockBuildInitialRoutineSets.mockReset();
  mockBuildInitialRoutineSets.mockResolvedValue([{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);
  mockGetRoutineDetail.mockReset();
  mockGetRoutineDetail.mockResolvedValue(null);
});

describe('addScheduledWorkout', () => {
  it('routineId/scheduledDate/hour/minute/notifyEnabledをvaluesに渡してinsertし、挿入行のidを返す（ルーティンに種目が無ければscheduledWorkouts行のみinsertする）', async () => {
    const id = await addScheduledWorkout(10, '2026-07-25', 19, 30, true);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30, notifyEnabled: true });
    expect(id).toBe(42);
  });

  it('notifyEnabled=falseで呼んだ場合はfalseのままvaluesに渡す（通知トグルOFF、@ユーザー指摘機能）', async () => {
    await addScheduledWorkout(10, '2026-07-25', 19, 30, false);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ notifyEnabled: false });
  });

  it('hour/minuteの境界値(0, 23, 59)はinsertされる', async () => {
    await addScheduledWorkout(10, '2026-07-25', 0, 0, true);
    await addScheduledWorkout(10, '2026-07-25', 23, 59, true);
    expect(mockInsertValues).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['hour=24(範囲外)', 24, 0],
    ['hour=-1(範囲外)', -1, 0],
    ['minute=60(範囲外)', 19, 60],
    ['minute=-1(範囲外)', 19, -1],
  ])('%s はinsertを呼ばず例外を投げる（getRoutineDetailも呼ばれない、無駄な読み取り防止、@tester指摘）', async (_label, hour, minute) => {
    await expect(addScheduledWorkout(10, '2026-07-25', hour, minute, true)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockGetRoutineDetail).not.toHaveBeenCalled();
  });

  // ルーティン予定も直接予定と同じくscheduledWorkoutExercises/scheduledWorkoutSetsに
  // その予定インスタンス専用の種目・目標セットを持たせる（2026-07-21、@ユーザー指摘）。
  // 目標セットは直近実績のプリフィルではなく、ルーティン本体の実際の値をそのままコピーする
  it('ルーティンに種目があれば、getRoutineDetailの実際の目標セット値をscheduledWorkoutExercises/scheduledWorkoutSetsへコピーする', async () => {
    mockGetRoutineDetail.mockResolvedValue({
      routine: { id: 10, name: '胸の日' },
      reminder: null,
      exercises: [
        { id: 1, exerciseId: 5, orderIndex: 0, sets: [{ id: 900, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] },
        { id: 2, exerciseId: 8, orderIndex: 1, sets: [] },
      ],
    });

    const id = await addScheduledWorkout(10, '2026-07-25', 19, 30, true);

    expect(mockGetRoutineDetail).toHaveBeenCalledWith(10);
    // scheduledWorkouts 1回 + scheduledWorkoutExercises 1回（2件まとめて）+ scheduledWorkoutSets 2回（種目ごと）
    expect(mockInsertValues).toHaveBeenCalledTimes(4);
    const [, exerciseValues] = mockInsertValues.mock.calls[1];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 5, orderIndex: 0 }),
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 8, orderIndex: 1 }),
    ]);
    // 1件目はルーティンの目標セット値そのまま、2件目(0セット)は空欄1セットにフォールバックする
    const [, firstSetValues] = mockInsertValues.mock.calls[2];
    expect(firstSetValues).toEqual([expect.objectContaining({ weight: 60, reps: 8 })]);
    const [, secondSetValues] = mockInsertValues.mock.calls[3];
    expect(secondSetValues).toEqual([expect.objectContaining({ weight: null, reps: null })]);
    expect(mockBuildInitialRoutineSets).not.toHaveBeenCalled();
    expect(id).toBe(42);
  });

  // insertScheduledWorkoutSetsFromValuesはsetNumberを無視し配列順で1から振り直す実装のため、
  // 複数セットで値と順序の対応が崩れていないかを明示的に検証する（@tester指摘）
  it('種目が複数セットを持つ場合、setNumberと値の対応を保ったまま全セットをコピーする', async () => {
    mockGetRoutineDetail.mockResolvedValue({
      routine: { id: 10, name: '胸の日' },
      reminder: null,
      exercises: [
        {
          id: 1,
          exerciseId: 5,
          orderIndex: 0,
          sets: [
            { id: 900, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
            { id: 901, weight: 65, reps: 8, durationSeconds: null, distanceMeters: null },
            { id: 902, weight: 70, reps: 6, durationSeconds: null, distanceMeters: null },
          ],
        },
      ],
    });

    await addScheduledWorkout(10, '2026-07-25', 19, 30, true);

    const [, setValues] = mockInsertValues.mock.calls[2];
    expect(setValues).toEqual([
      expect.objectContaining({ setNumber: 1, weight: 60, reps: 10 }),
      expect.objectContaining({ setNumber: 2, weight: 65, reps: 8 }),
      expect.objectContaining({ setNumber: 3, weight: 70, reps: 6 }),
    ]);
  });

  // 既存テストがweight/reps系の種目しか使っておらず、durationSeconds/distanceMetersの取り違え
  // （実装側でフィールドを逆に書く等）を検知できていなかったため追加（@tester指摘）
  it('duration/distance系の目標値もweight/reps同様にそのままコピーする（有酸素・プランク等）', async () => {
    mockGetRoutineDetail.mockResolvedValue({
      routine: { id: 10, name: '有酸素の日' },
      reminder: null,
      exercises: [
        {
          id: 1,
          exerciseId: 5,
          orderIndex: 0,
          sets: [{ id: 900, weight: null, reps: null, durationSeconds: 60, distanceMeters: 500 }],
        },
      ],
    });

    await addScheduledWorkout(10, '2026-07-25', 19, 30, true);

    const [, setValues] = mockInsertValues.mock.calls[2];
    expect(setValues).toEqual([
      expect.objectContaining({ weight: null, reps: null, durationSeconds: 60, distanceMeters: 500 }),
    ]);
  });

  it('ルーティンが削除済み(getRoutineDetailがnullを返す)場合はscheduledWorkouts行のみinsertする', async () => {
    mockGetRoutineDetail.mockResolvedValue(null);
    const id = await addScheduledWorkout(10, '2026-07-25', 19, 30, true);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(id).toBe(42);
  });

  // detail自体はnullではないが種目0件のケース（削除済みnullとは別のコードパスを通るため、
  // 実装コメントが両方明示している以上テストも両方揃える、@reviewer・@tester指摘）
  it('ルーティンは存在するが種目が0件の場合もscheduledWorkouts行のみinsertする', async () => {
    mockGetRoutineDetail.mockResolvedValue({ routine: { id: 10, name: '空ルーティン' }, reminder: null, exercises: [] });
    const id = await addScheduledWorkout(10, '2026-07-25', 19, 30, true);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(id).toBe(42);
  });
});

// 「直接追加」（ルーティンを介さず個別に選んだ種目で予定を作る、2026-07-20）
describe('addDirectScheduledWorkout', () => {
  it('routineId:nullでscheduledWorkoutsをinsertし、返ったidで各exerciseIdをorderIndex付きでscheduledWorkoutExercisesへinsertし、各種目の目標セットもinsertする', async () => {
    const id = await addDirectScheduledWorkout([5, 8, 3], '2026-07-25', 19, 30, true);

    // scheduledWorkouts 1回 + scheduledWorkoutExercises 1回（3件まとめて）+ scheduledWorkoutSets 3回（種目ごと）
    expect(mockInsertValues).toHaveBeenCalledTimes(5);
    const [, scheduledWorkoutValues] = mockInsertValues.mock.calls[0];
    expect(scheduledWorkoutValues).toMatchObject({
      routineId: null,
      scheduledDate: '2026-07-25',
      hour: 19,
      minute: 30,
      notifyEnabled: true,
    });

    const [, exerciseValues] = mockInsertValues.mock.calls[1];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 5, orderIndex: 0 }),
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 8, orderIndex: 1 }),
      expect.objectContaining({ scheduledWorkoutId: 42, exerciseId: 3, orderIndex: 2 }),
    ]);
    expect(mockBuildInitialRoutineSets).toHaveBeenCalledTimes(3);
    expect(id).toBe(42);
  });

  it('exerciseIdsが空の場合はinsertを呼ばず例外を投げる', async () => {
    await expect(addDirectScheduledWorkout([], '2026-07-25', 19, 30, true)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it.each([
    ['hour=24(範囲外)', 24, 0],
    ['minute=60(範囲外)', 19, 60],
  ])('%s はinsertを呼ばず例外を投げる', async (_label, hour, minute) => {
    await expect(addDirectScheduledWorkout([1], '2026-07-25', hour, minute, true)).rejects.toThrow();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe('deleteScheduledWorkout', () => {
  it('指定したidでdeleteする', async () => {
    await deleteScheduledWorkout(42);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
