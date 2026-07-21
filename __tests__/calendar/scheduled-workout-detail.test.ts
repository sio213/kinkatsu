// lib/calendar/scheduled-workout-detail.tsの各関数がどのテーブルに対してどの引数で操作を
// 発行するかを検証する（__tests__/calendar/scheduled-workouts.test.tsと同じモック方針）。
// FK cascade等の実DB挙動はscheduled-workouts-integration.test.tsが担当する
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockSelectWhere: jest.Mock;

jest.mock('@/db/client', () => {
  mockReturning = jest.fn((_table: unknown, values: unknown) => {
    if (Array.isArray(values)) return Promise.resolve(values.map((v, i) => ({ id: 42 + i, ...(v as object) })));
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
  mockSelectWhere = jest.fn().mockResolvedValue([]);

  function selectWhere(...args: unknown[]) {
    const result = mockSelectWhere(...args) as Promise<unknown> & { orderBy?: unknown; limit?: unknown };
    result.orderBy = jest.fn().mockReturnValue(result);
    result.limit = jest.fn().mockReturnValue(result);
    return result;
  }

  const tx = {
    insert: jest.fn((table: unknown) => ({ values: (...args: unknown[]) => mockInsertValues(table, ...args) })),
    delete: jest.fn((table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) })),
    update: jest.fn((table: unknown) => ({ set: (...args: unknown[]) => mockUpdateSet(table, ...args) })),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => selectWhere(...args) }),
    }),
  };

  return {
    db: {
      insert: jest.fn((table: unknown) => ({ values: (...args: unknown[]) => mockInsertValues(table, ...args) })),
      delete: jest.fn((table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) })),
      update: jest.fn((table: unknown) => ({ set: (...args: unknown[]) => mockUpdateSet(table, ...args) })),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => selectWhere(...args) }),
      }),
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  scheduledWorkoutExercises: {
    id: 'id',
    scheduledWorkoutId: 'scheduledWorkoutId',
    exerciseId: 'exerciseId',
    orderIndex: 'orderIndex',
  },
  scheduledWorkoutSets: { id: 'id', scheduledWorkoutExerciseId: 'scheduledWorkoutExerciseId', setNumber: 'setNumber' },
  scheduledWorkouts: { id: 'id', updatedAt: 'updatedAt' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ desc: col })),
  and: jest.fn((...conditions) => ({ and: conditions })),
}));

const mockBuildInitialRoutineSets = jest.fn();
const mockGetRoutineDetail = jest.fn();
jest.mock('@/lib/routines/db', () => ({
  buildInitialRoutineSets: (...args: unknown[]) => mockBuildInitialRoutineSets(...args),
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
}));

const mockGetPreviousSetsForCard = jest.fn();
jest.mock('@/lib/workout/history', () => ({
  getPreviousSetsForCard: (...args: unknown[]) => mockGetPreviousSetsForCard(...args),
}));

import { db } from '@/db/client';
import {
  addExercisesToScheduledWorkout,
  addHistoryCardsToScheduledWorkout,
  addRoutineExercisesToScheduledWorkout,
  addScheduledWorkoutSet,
  deleteLastScheduledWorkoutSet,
  deleteScheduledWorkoutSet,
  getScheduledWorkoutSetsForExercise,
  moveScheduledWorkoutExercise,
  removeScheduledWorkoutExercise,
  reorderScheduledWorkoutExercises,
  replaceScheduledWorkoutExercise,
  updateScheduledWorkoutSetValues,
} from '@/lib/calendar/scheduled-workout-detail';

beforeEach(() => {
  mockInsertValues.mockClear();
  mockReturning.mockClear();
  mockDeleteWhere.mockClear();
  mockUpdateSet.mockClear();
  mockUpdateWhere.mockClear();
  mockSelectWhere.mockReset();
  mockSelectWhere.mockResolvedValue([]);
  mockBuildInitialRoutineSets.mockReset();
  mockBuildInitialRoutineSets.mockResolvedValue([{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);
  mockGetRoutineDetail.mockReset();
  mockGetPreviousSetsForCard.mockReset();
});

describe('addExercisesToScheduledWorkout', () => {
  it('exerciseIdsが空なら何もしない', async () => {
    await addExercisesToScheduledWorkout(1, []);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('既存の最大orderIndexの続きから種目を追加し、各種目の目標セットを直近の実績からプリフィルする', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 1 }]); // getMaxOrderIndex
    mockBuildInitialRoutineSets
      .mockResolvedValueOnce([{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }])
      .mockResolvedValueOnce([{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);

    await addExercisesToScheduledWorkout(1, [20, 21]);

    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 1, exerciseId: 20, orderIndex: 2 }),
      expect.objectContaining({ scheduledWorkoutId: 1, exerciseId: 21, orderIndex: 3 }),
    ]);
    expect(mockBuildInitialRoutineSets).toHaveBeenCalledWith(20);
    expect(mockBuildInitialRoutineSets).toHaveBeenCalledWith(21);
    const [, setsValuesForFirst] = mockInsertValues.mock.calls[1];
    expect(setsValuesForFirst).toEqual([expect.objectContaining({ weight: 60, reps: 8, setNumber: 1 })]);
  });

  it('既存の種目が無い予定にはorderIndex 0から採番する', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex: 既存無し
    await addExercisesToScheduledWorkout(1, [30]);
    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([expect.objectContaining({ orderIndex: 0 })]);
  });
});

describe('addRoutineExercisesToScheduledWorkout', () => {
  it('selectionsが空なら何もしない', async () => {
    await addRoutineExercisesToScheduledWorkout(1, 10, []);
    expect(mockGetRoutineDetail).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('ルーティンが見つからない場合は何もしない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce(null);
    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }]);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('選んだ種目だけを、ルーティン内の表示順(orderIndex順)で追加し、ルーティンの目標セットの値をそのままコピーする', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [
        {
          id: 501,
          exerciseId: 20,
          sets: [{ id: 1, setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }],
        },
        {
          id: 502,
          exerciseId: 21,
          sets: [{ id: 2, setNumber: 1, weight: 40, reps: 12, durationSeconds: null, distanceMeters: null }],
        },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }]); // getMaxOrderIndex

    // 選択順は502→501（クリック順とは逆）でも、送信されるのはルーティン内の表示順(501→502)
    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 502 }, { routineExerciseId: 501 }]);

    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ scheduledWorkoutId: 1, exerciseId: 20, orderIndex: 1 }),
      expect.objectContaining({ scheduledWorkoutId: 1, exerciseId: 21, orderIndex: 2 }),
    ]);
    const [, firstSetsValues] = mockInsertValues.mock.calls[1];
    expect(firstSetsValues).toEqual([expect.objectContaining({ weight: 60, reps: 8, setNumber: 1 })]);
    const [, secondSetsValues] = mockInsertValues.mock.calls[2];
    expect(secondSetsValues).toEqual([expect.objectContaining({ weight: 40, reps: 12, setNumber: 1 })]);
  });

  it('ルーティンの種目に0セットのものが含まれる場合は空欄1セットにフォールバックする', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 20, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex

    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }]);

    const [, setsValues] = mockInsertValues.mock.calls[1];
    expect(setsValues).toEqual([expect.objectContaining({ weight: null, reps: null, setNumber: 1 })]);
  });

  it('選択したidがルーティン内に1件も見つからない場合は何もしない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 20, sets: [] }],
    });
    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 999 }]);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('有効なidと無効なid(削除済み等)が混在する場合、有効な分だけ処理する(クライアントの値を信用しない)', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 20, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex

    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }, { routineExerciseId: 999 }]);

    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([expect.objectContaining({ exerciseId: 20 })]);
  });

  it('種目の追加とあわせて予定のupdatedAtも更新する', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 20, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex

    await addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }]);

    // exerciseId更新系の他関数と同様、insert(2回) + updatedAt更新(1回)でmockUpdateWhereが呼ばれる
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('ルーティンのgetRoutineDetailが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockRejectedValueOnce(new Error('db error'));
    await expect(addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }])).rejects.toThrow(
      'db error',
    );
  });

  it('insertが失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 10, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 20, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockRejectedValueOnce(new Error('insert error'));
    await expect(addRoutineExercisesToScheduledWorkout(1, 10, [{ routineExerciseId: 501 }])).rejects.toThrow(
      'insert error',
    );
  });
});

describe('addHistoryCardsToScheduledWorkout', () => {
  it('selectionsが空なら何もしない', async () => {
    await addHistoryCardsToScheduledWorkout(1, []);
    expect(mockGetPreviousSetsForCard).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('選んだ過去カードのセット値をそのままコピーして新規種目として追加する', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }]); // getMaxOrderIndex
    mockGetPreviousSetsForCard.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    ]);

    await addHistoryCardsToScheduledWorkout(1, [{ exerciseId: 20, sourceWorkoutSessionExerciseId: 900 }]);

    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([expect.objectContaining({ scheduledWorkoutId: 1, exerciseId: 20, orderIndex: 1 })]);
    expect(mockGetPreviousSetsForCard).toHaveBeenCalledWith(expect.anything(), 900);
    const [, setsValues] = mockInsertValues.mock.calls[1];
    expect(setsValues).toEqual([expect.objectContaining({ weight: 60, reps: 8, setNumber: 1 })]);
  });

  it('複数の過去カードを選んだ場合、選択順のまま新規種目として複数追加する', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex
    mockGetPreviousSetsForCard
      .mockResolvedValueOnce([{ setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }])
      .mockResolvedValueOnce([{ setNumber: 1, weight: 40, reps: 12, durationSeconds: null, distanceMeters: null }]);

    await addHistoryCardsToScheduledWorkout(1, [
      { exerciseId: 20, sourceWorkoutSessionExerciseId: 900 },
      { exerciseId: 21, sourceWorkoutSessionExerciseId: 901 },
    ]);

    const [, exerciseValues] = mockInsertValues.mock.calls[0];
    expect(exerciseValues).toEqual([
      expect.objectContaining({ exerciseId: 20, orderIndex: 0 }),
      expect.objectContaining({ exerciseId: 21, orderIndex: 1 }),
    ]);
  });

  it('確定セットが1件も無い(全カラムnullのみ)過去カードは空欄1セットにフォールバックする', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex
    mockGetPreviousSetsForCard.mockResolvedValueOnce([
      { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);

    await addHistoryCardsToScheduledWorkout(1, [{ exerciseId: 20, sourceWorkoutSessionExerciseId: 900 }]);

    const [, setsValues] = mockInsertValues.mock.calls[1];
    expect(setsValues).toEqual([expect.objectContaining({ weight: null, reps: null, setNumber: 1 })]);
  });

  it('値あり行と全カラムnullの行が混在する過去カードは、null行だけ除外して値あり行のみコピーする', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex
    mockGetPreviousSetsForCard.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);

    await addHistoryCardsToScheduledWorkout(1, [{ exerciseId: 20, sourceWorkoutSessionExerciseId: 900 }]);

    const [, setsValues] = mockInsertValues.mock.calls[1];
    expect(setsValues).toEqual([expect.objectContaining({ weight: 60, reps: 8, setNumber: 1 })]);
  });

  it('種目の追加とあわせて予定のupdatedAtも更新する', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // getMaxOrderIndex
    mockGetPreviousSetsForCard.mockResolvedValueOnce([]);

    await addHistoryCardsToScheduledWorkout(1, [{ exerciseId: 20, sourceWorkoutSessionExerciseId: 900 }]);

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockRejectedValueOnce(new Error('insert error'));
    await expect(
      addHistoryCardsToScheduledWorkout(1, [{ exerciseId: 20, sourceWorkoutSessionExerciseId: 900 }]),
    ).rejects.toThrow('insert error');
  });
});

describe('removeScheduledWorkoutExercise', () => {
  it('削除する', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ scheduledWorkoutId: 1 }]); // 対象行のscheduledWorkoutId検索
    await removeScheduledWorkoutExercise(100);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  // ルーティン・過去記録と同様、最後の1件も削除できる（2026-07-22、@ユーザー指摘で安全網を撤廃。
  // 0件になった予定はschedule-exercise-card-group.tsx側の空状態UIで表示・再度種目を追加できる）
  it('最後の1件でも削除できる', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ scheduledWorkoutId: 1 }]);
    await removeScheduledWorkoutExercise(100);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it('対象行が既に存在しない場合は何もしない（安全網）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await removeScheduledWorkoutExercise(999);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});

describe('replaceScheduledWorkoutExercise', () => {
  it('exerciseIdを更新し、既存の目標セットを削除してから新しい種目の直近実績をプリフィルする', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ scheduledWorkoutId: 1 }]); // 対象行のscheduledWorkoutId検索
    mockBuildInitialRoutineSets.mockResolvedValueOnce([{ weight: 40, reps: 12, durationSeconds: null, distanceMeters: null }]);

    await replaceScheduledWorkoutExercise(100, 55);

    // exerciseId更新 + 予定のupdatedAt更新で2回
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    const [, setsValues] = mockInsertValues.mock.calls[0];
    expect(setsValues).toEqual([expect.objectContaining({ scheduledWorkoutExerciseId: 100, weight: 40, reps: 12, setNumber: 1 })]);
  });

  it('対象行が既に存在しない場合は何もしない（安全網）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await replaceScheduledWorkoutExercise(999, 55);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe('moveScheduledWorkoutExercise', () => {
  it('上へ移動: 隣接する種目とorderIndexを入れ替える', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { id: 100, orderIndex: 0 },
      { id: 101, orderIndex: 1 },
    ]);
    await moveScheduledWorkoutExercise(1, 101, 'up');
    // orderIndexの入れ替え2回 + 予定のupdatedAt更新1回
    expect(mockUpdateWhere).toHaveBeenCalledTimes(3);
  });

  it('先頭の種目を上へ移動しようとした場合は何もしない', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { id: 100, orderIndex: 0 },
      { id: 101, orderIndex: 1 },
    ]);
    await moveScheduledWorkoutExercise(1, 100, 'up');
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it('末尾の種目を下へ移動しようとした場合は何もしない', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { id: 100, orderIndex: 0 },
      { id: 101, orderIndex: 1 },
    ]);
    await moveScheduledWorkoutExercise(1, 101, 'down');
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});

describe('reorderScheduledWorkoutExercises', () => {
  it('渡された順にorderIndexを振り直し、最後に予定のupdatedAtも更新する', async () => {
    await reorderScheduledWorkoutExercises(1, [102, 100, 101]);
    // 3件のorderIndex更新 + 予定のupdatedAt更新で4回
    expect(mockUpdateWhere).toHaveBeenCalledTimes(4);
    expect(mockUpdateSet.mock.calls[0][1]).toEqual({ orderIndex: 0 });
    expect(mockUpdateSet.mock.calls[1][1]).toEqual({ orderIndex: 1 });
    expect(mockUpdateSet.mock.calls[2][1]).toEqual({ orderIndex: 2 });
  });

  it('空配列なら何もしない', async () => {
    await reorderScheduledWorkoutExercises(1, []);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });
});

describe('addScheduledWorkoutSet', () => {
  it('既存セットが無ければ空欄のsetNumber=1を追加する', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await addScheduledWorkoutSet(100);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ scheduledWorkoutExerciseId: 100, setNumber: 1, weight: null, reps: null });
  });

  it('既存セットがあれば直前セットの値をコピーして続きの番号で追加する', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }]);
    await addScheduledWorkoutSet(100);
    const [, values] = mockInsertValues.mock.calls[0];
    expect(values).toMatchObject({ scheduledWorkoutExerciseId: 100, setNumber: 3, weight: 60, reps: 8 });
  });
});

describe('deleteLastScheduledWorkoutSet', () => {
  it('setNumberが最大の行を削除する', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 900 }]);
    await deleteLastScheduledWorkoutSet(100);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it('セットが1件も無ければ何もしない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await deleteLastScheduledWorkoutSet(100);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});

describe('deleteScheduledWorkoutSet', () => {
  it('指定したidでdeleteする', async () => {
    await deleteScheduledWorkoutSet(900);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe('updateScheduledWorkoutSetValues', () => {
  it('指定したidの行をupdateする', async () => {
    await updateScheduledWorkoutSetValues(900, { weight: 65, reps: 10, durationSeconds: null, distanceMeters: null });
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    const [, values] = mockUpdateSet.mock.calls[0];
    expect(values).toEqual({ weight: 65, reps: 10, durationSeconds: null, distanceMeters: null });
  });
});

describe('getScheduledWorkoutSetsForExercise', () => {
  it('値が1つも無い行は除外して返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    const result = await getScheduledWorkoutSetsForExercise(db, 100);
    expect(result).toEqual([{ setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }]);
  });
});
