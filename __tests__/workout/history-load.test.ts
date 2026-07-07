// session.test.tsのtxモックはselect().from().where()で完結する形（orderByを使わない既存関数向け）
// のため、loadHistoryIntoSessionExercise/undoLoadHistoryが使う.where().orderBy()チェーンには
// 対応できない。この2関数専用に、テーブル(workoutSessionExercises/sets)で分岐しつつ
// orderByまで含めてチェーンできるモックをこのファイルで独自に用意する
/* eslint-disable no-var */
var mockWseWhere: jest.Mock;
var mockSetsOrderBy: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;

jest.mock('@/db/client', () => {
  const schema = require('@/db/schema');

  mockWseWhere = jest.fn().mockResolvedValue([]);
  mockSetsOrderBy = jest.fn().mockResolvedValue([]);
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockReturning = jest.fn().mockResolvedValue([]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });

  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        if (table === schema.workoutSessionExercises) {
          return { where: (...args: unknown[]) => mockWseWhere(...args) };
        }
        return {
          where: jest.fn(() => ({
            orderBy: (...args: unknown[]) => mockSetsOrderBy(...args),
          })),
        };
      }),
    })),
    delete: jest.fn(() => ({ where: (...args: unknown[]) => mockDeleteWhere(...args) })),
    insert: jest.fn(() => ({ values: (...args: unknown[]) => mockInsertValues(...args) })),
  };

  return {
    db: {
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId', exerciseId: 'exerciseId' },
  sets: {
    id: 'id',
    sessionId: 'sessionId',
    exerciseId: 'exerciseId',
    workoutSessionExerciseId: 'workoutSessionExerciseId',
    setNumber: 'setNumber',
    weight: 'weight',
    reps: 'reps',
    durationSeconds: 'durationSeconds',
    distanceMeters: 'distanceMeters',
    completedAt: 'completedAt',
  },
  workoutSessions: {},
}));

jest.mock('drizzle-orm', () => ({ eq: jest.fn((col, val) => ({ col, val })) }));

import { loadHistoryIntoSessionExercise, undoLoadHistory } from '@/lib/workout/session';

beforeEach(() => {
  jest.clearAllMocks();
  mockWseWhere.mockResolvedValue([{ sessionId: 1, exerciseId: 10 }]);
  mockSetsOrderBy.mockResolvedValue([]);
  mockDeleteWhere.mockResolvedValue(undefined);
  mockInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockReturning.mockResolvedValue([]);
});

describe('loadHistoryIntoSessionExercise', () => {
  it('対象カードが見つからない場合は何もせず空の結果を返す', async () => {
    mockWseWhere.mockResolvedValueOnce([]);

    const result = await loadHistoryIntoSessionExercise(1, 99);

    expect(result).toEqual({ prefilledSetIds: [], previousSnapshot: [] });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('既存セット(previousSnapshot用)を読み取ってから削除し、選んだ過去カードのセット列をコピーして挿入し直す', async () => {
    const callOrder: string[] = [];
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    // 1回目の呼び出し=削除前の既存セット(previousSnapshot)、2回目=コピー元(過去カード)のセット
    mockSetsOrderBy
      .mockImplementationOnce(async () => {
        callOrder.push('select-existing');
        return [
          { setNumber: 1, weight: 50, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: 111 },
        ];
      })
      .mockImplementationOnce(async () => {
        callOrder.push('select-history');
        return [{ setNumber: 1, weight: 80, reps: 5, durationSeconds: null, distanceMeters: null }];
      });
    mockDeleteWhere.mockImplementationOnce(async () => {
      callOrder.push('delete');
    });
    mockReturning.mockImplementationOnce(async () => {
      callOrder.push('insert');
      return [{ id: 701 }];
    });

    const result = await loadHistoryIntoSessionExercise(7, 500);

    // 既存セットの読み取り→過去カードの読み取り→削除→挿入の順で実行する
    // （previousSnapshot用の読み取りをdeleteより先に済ませておかないと、スナップショットが壊れる）
    expect(callOrder).toEqual(['select-existing', 'select-history', 'delete', 'insert']);
    expect(mockDeleteWhere).toHaveBeenCalledWith({ col: 'workoutSessionExerciseId', val: 7 });

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload).toEqual([
      {
        sessionId: 3,
        exerciseId: 20,
        workoutSessionExerciseId: 7,
        setNumber: 1,
        weight: 80,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result.previousSnapshot).toEqual([
      { setNumber: 1, weight: 50, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: 111 },
    ]);
    expect(result.prefilledSetIds).toEqual([701]);
  });

  it('コピー元カードのsetNumberが1から始まっていない/連番でない場合でも、新カードでは1,2,3...に振り直す（バグ回帰防止）', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    mockSetsOrderBy
      .mockResolvedValueOnce([]) // 既存セット(previousSnapshot)は無し
      .mockResolvedValueOnce([
        // コピー元カードのsetNumberが何らかの理由で2,3,4など不連続なケース
        { setNumber: 2, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
        { setNumber: 3, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
        { setNumber: 4, weight: 55, reps: 8, durationSeconds: null, distanceMeters: null },
      ]);
    mockReturning.mockResolvedValueOnce([{ id: 701 }, { id: 702 }, { id: 703 }]);

    await loadHistoryIntoSessionExercise(7, 500);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload.map((row: { setNumber: number }) => row.setNumber)).toEqual([1, 2, 3]);
  });

  it('コピー元の過去カードにセットが無い場合、値が空でsetNumber=1のセットを1件だけ作り直しprefilledSetIdsは空になる', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 1, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // 既存セットも過去カードのセットも無し
    mockReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await loadHistoryIntoSessionExercise(1, 500);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload).toEqual([
      {
        sessionId: 1,
        exerciseId: 10,
        workoutSessionExerciseId: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result.prefilledSetIds).toEqual([]);
  });

  it('コピー元のセットが全カラムnullの場合、空の1件だけが作られprefilledSetIdsも空になる', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 1, exerciseId: 10 }]);
    mockSetsOrderBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
      ]);
    mockReturning.mockResolvedValueOnce([{ id: 701 }]);

    const result = await loadHistoryIntoSessionExercise(1, 500);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload).toHaveLength(1);
    expect(insertedPayload[0].weight).toBeNull();
    expect(result.prefilledSetIds).toEqual([]);
  });

  it('コピー元のセットに全カラムnullの行が混ざっている場合、その行だけコピー対象から除外し余分な空行を作らない（バグ回帰防止: 過去の記録から読み込むと余分な空行が出る不具合）', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    mockSetsOrderBy
      .mockResolvedValueOnce([]) // 既存セット(previousSnapshot)は無し
      .mockResolvedValueOnce([
        { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
        { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
        { setNumber: 3, weight: 55, reps: 8, durationSeconds: null, distanceMeters: null },
      ]);
    mockReturning.mockResolvedValueOnce([{ id: 701 }, { id: 702 }]);

    const result = await loadHistoryIntoSessionExercise(7, 500);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(
      insertedPayload.map((row: { setNumber: number; weight: number | null }) => [row.setNumber, row.weight]),
    ).toEqual([
      [1, 60],
      [2, 55],
    ]);
    expect(result.prefilledSetIds).toEqual([701, 702]);
  });

  it('削除が失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockDeleteWhere.mockRejectedValueOnce(new Error('delete error'));
    await expect(loadHistoryIntoSessionExercise(1, 500)).rejects.toThrow('delete error');
  });

  it('挿入が失敗した場合もエラーを握りつぶさずthrowする（fire-and-forget禁止）', async () => {
    mockReturning.mockRejectedValueOnce(new Error('insert error'));
    await expect(loadHistoryIntoSessionExercise(1, 500)).rejects.toThrow('insert error');
  });
});

describe('undoLoadHistory', () => {
  it('対象カードが見つからない場合は何もしない（delete/insertどちらも呼ばれない）', async () => {
    mockWseWhere.mockResolvedValueOnce([]);

    await undoLoadHistory(1, [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 1 }]);

    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('previousSnapshotの内容(completedAtを含む)をそのまま再insertする', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    const snapshot = [
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null, completedAt: 123 },
      { setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null, completedAt: null },
    ];

    await undoLoadHistory(7, snapshot);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload).toEqual([
      {
        sessionId: 3,
        exerciseId: 20,
        workoutSessionExerciseId: 7,
        setNumber: 1,
        weight: 60,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: 123,
        createdAt: expect.any(Number),
      },
      {
        sessionId: 3,
        exerciseId: 20,
        workoutSessionExerciseId: 7,
        setNumber: 2,
        weight: 60,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
  });

  it('previousSnapshotが空配列(読み込み前が0セットだった場合)は値が空の1セットにフォールバックする', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 1, exerciseId: 10 }]);

    await undoLoadHistory(1, []);

    const insertedPayload = mockInsertValues.mock.calls[0][0];
    expect(insertedPayload).toEqual([
      {
        sessionId: 1,
        exerciseId: 10,
        workoutSessionExerciseId: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
  });

  it('削除→挿入の順で実行する', async () => {
    // undoLoadHistoryのinsertは.returning()を挟まずtx.insert(sets).values(rows)を直接awaitするため、
    // values()呼び出し自体（同期的に発火する）をorder記録のフックにする
    const callOrder: string[] = [];
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 1, exerciseId: 10 }]);
    mockDeleteWhere.mockImplementationOnce(async () => {
      callOrder.push('delete');
    });
    mockInsertValues.mockImplementationOnce(() => {
      callOrder.push('insert');
      return Promise.resolve(undefined);
    });

    await undoLoadHistory(1, []);

    expect(callOrder).toEqual(['delete', 'insert']);
  });

  it('削除が失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockDeleteWhere.mockRejectedValueOnce(new Error('delete error'));
    await expect(undoLoadHistory(1, [])).rejects.toThrow('delete error');
  });

  it('挿入が失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockInsertValues.mockImplementationOnce(() => Promise.reject(new Error('insert error')));
    await expect(undoLoadHistory(1, [])).rejects.toThrow('insert error');
  });
});
