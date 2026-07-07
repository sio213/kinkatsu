// session.test.tsのtxモックはselect().from().where()で完結する形（orderByを使わない既存関数向け）
// のため、loadHistoryIntoSessionExerciseが使う.where().orderBy()チェーンには対応できない。
// この関数専用に、テーブル(workoutSessionExercises/sets)で分岐しつつorderByまで含めて
// チェーンできるモックをこのファイルで独自に用意する
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

import { loadHistoryIntoSessionExercise } from '@/lib/workout/session';

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

    expect(result).toEqual({ prefilledSetIds: [] });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('選んだ過去カードのセット列を読み取ってから削除し、コピーして挿入し直す', async () => {
    const callOrder: string[] = [];
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    mockSetsOrderBy.mockImplementationOnce(async () => {
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

    // 過去カードの読み取り→削除→挿入の順で実行する
    expect(callOrder).toEqual(['select-history', 'delete', 'insert']);
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
    expect(result.prefilledSetIds).toEqual([701]);
  });

  it('コピー元カードのsetNumberが1から始まっていない/連番でない場合でも、新カードでは1,2,3...に振り直す（バグ回帰防止）', async () => {
    mockWseWhere.mockResolvedValueOnce([{ sessionId: 3, exerciseId: 20 }]);
    mockSetsOrderBy.mockResolvedValueOnce([
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
    mockSetsOrderBy.mockResolvedValueOnce([]);
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
    mockSetsOrderBy.mockResolvedValueOnce([
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
    mockSetsOrderBy.mockResolvedValueOnce([
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
