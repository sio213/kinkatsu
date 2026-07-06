// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockSelectWhere: jest.Mock;

// addSetは`await tx.select()...where(...)`を直接await、deleteLastSetは
// `.where(...).orderBy(...).limit(...)`を経由してawaitするため、
// where()の戻り値はthenable（直接await可）かつ.orderBy().limit()も持たせる
function mockMakeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  return {
    orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(resolved) }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
  };
}

jest.mock('@/db/client', () => {
  mockInsertValues = jest.fn().mockResolvedValue(undefined);
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockSelectWhere = jest.fn().mockReturnValue(mockMakeSelectChain([]));

  const tx = {
    insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockInsertValues(...args) }),
    delete: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockDeleteWhere(...args) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockSelectWhere(...args) }),
    }),
  };

  return {
    db: {
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockUpdateSet(...args) }),
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
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
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ col, dir: 'desc' })),
}));

import { addSet, deleteLastSet, reopenSet, saveSet } from '@/lib/workout/sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertValues.mockResolvedValue(undefined);
  mockUpdateWhere.mockResolvedValue(undefined);
  mockDeleteWhere.mockResolvedValue(undefined);
  mockSelectWhere.mockReturnValue(mockMakeSelectChain([]));
});

describe('addSet', () => {
  it('既存セットが無いカードではsetNumber=1・値は全てnullで作る', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([]));
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual({
      sessionId: 1,
      exerciseId: 10,
      workoutSessionExerciseId: 100,
      setNumber: 1,
      weight: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      completedAt: null,
      createdAt: expect.any(Number),
    });
  });

  it('既存セットがあるカードでは最大setNumberの続きから振る', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([
        { setNumber: 2, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
      ]),
    );
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.setNumber).toBe(3);
  });

  it('直前のセット（setNumber最大）の重量・回数・時間・距離をコピーする', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([
        { setNumber: 1, weight: 62.5, reps: 8, durationSeconds: 30, distanceMeters: 1.5 },
      ]),
    );
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual({
      sessionId: 1,
      exerciseId: 10,
      workoutSessionExerciseId: 100,
      setNumber: 2,
      weight: 62.5,
      reps: 8,
      durationSeconds: 30,
      distanceMeters: 1.5,
      completedAt: null,
      createdAt: expect.any(Number),
    });
  });

  it('直前セットの一部カラムだけnullの場合、null/値それぞれ個別にコピーする', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([
        { setNumber: 1, weight: 60, reps: null, durationSeconds: null, distanceMeters: 1.2 },
      ]),
    );
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.weight).toBe(60);
    expect(payload.reps).toBeNull();
    expect(payload.durationSeconds).toBeNull();
    expect(payload.distanceMeters).toBe(1.2);
  });

  it('直前セットの値が0の場合、nullにフォールバックせず0のままコピーする（??の境界値）', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([{ setNumber: 1, weight: 0, reps: 0, durationSeconds: 0, distanceMeters: 0 }]),
    );
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.weight).toBe(0);
    expect(payload.reps).toBe(0);
    expect(payload.durationSeconds).toBe(0);
    expect(payload.distanceMeters).toBe(0);
  });

  it('直前セットが未確定（completedAt: null）でも値そのものはコピー対象になる（仕様の固定化）', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([
        { setNumber: 1, weight: 40, reps: 12, durationSeconds: null, distanceMeters: null, completedAt: null },
      ]),
    );
    await addSet(1, 10, 100);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.weight).toBe(40);
    expect(payload.reps).toBe(12);
  });

  it('直前セットの取得はworkoutSessionExerciseIdでスコープされる（重複カード対策の回帰防止）', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([{ setNumber: 1, weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null }]),
    );
    await addSet(1, 10, 100);

    expect(mockSelectWhere).toHaveBeenCalledWith({ col: 'workoutSessionExerciseId', val: 100 });
  });

  it('overrideValuesを渡すと、DB上の直前セットの値ではなくoverrideValuesをコピー元にする（✓未タップの入力途中の値用）', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([{ setNumber: 1, weight: 999, reps: 999, durationSeconds: 999, distanceMeters: 999 }]),
    );
    await addSet(1, 10, 100, { weight: 60, reps: 10 });

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.setNumber).toBe(2);
    expect(payload.weight).toBe(60);
    expect(payload.reps).toBe(10);
    expect(payload.durationSeconds).toBeNull();
    expect(payload.distanceMeters).toBeNull();
  });

  it('overrideValuesが空オブジェクト{}（全欄を空にした状態）の場合、DB上の直前セットへフォールバックせず全てnullにする', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([{ setNumber: 1, weight: 999, reps: 999, durationSeconds: 999, distanceMeters: 999 }]),
    );
    await addSet(1, 10, 100, {});

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.weight).toBeNull();
    expect(payload.reps).toBeNull();
    expect(payload.durationSeconds).toBeNull();
    expect(payload.distanceMeters).toBeNull();
  });

  it('overrideValuesが省略された場合はDB上の直前セットの値をコピーする（既定動作）', async () => {
    mockSelectWhere.mockReturnValueOnce(
      mockMakeSelectChain([{ setNumber: 1, weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null }]),
    );
    await addSet(1, 10, 100, undefined);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.weight).toBe(62.5);
    expect(payload.reps).toBe(8);
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([]));
    mockInsertValues.mockRejectedValueOnce(new Error('db error'));
    await expect(addSet(1, 10, 100)).rejects.toThrow('db error');
  });
});

describe('deleteLastSet', () => {
  it('セットが0件のときは何もしない', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([]));
    await deleteLastSet(100);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('setNumberが最大のセットを削除する（DESC+LIMIT1で先頭行を取得）', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ id: 103 }]));
    await deleteLastSet(100);
    expect(mockDeleteWhere).toHaveBeenCalledWith({ col: 'id', val: 103 });
  });

  it('deleteが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ id: 101 }]));
    mockDeleteWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(deleteLastSet(100)).rejects.toThrow('db error');
  });
});

describe('saveSet', () => {
  it('入力値とcompletedAtを同時にupdateする', async () => {
    const before = Date.now();
    await saveSet(5, { weight: 60, reps: 10 });
    const after = Date.now();

    const payload = mockUpdateSet.mock.calls[0][0];
    expect(payload.weight).toBe(60);
    expect(payload.reps).toBe(10);
    expect(payload.completedAt).toBeGreaterThanOrEqual(before);
    expect(payload.completedAt).toBeLessThanOrEqual(after);
    expect(mockUpdateWhere).toHaveBeenCalledWith({ col: 'id', val: 5 });
  });

  it('updateが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockUpdateWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(saveSet(5, { weight: 60 })).rejects.toThrow('db error');
  });
});

describe('reopenSet', () => {
  it('completedAtをnullに戻す', async () => {
    await reopenSet(5);
    const payload = mockUpdateSet.mock.calls[0][0];
    expect(payload).toEqual({ completedAt: null });
    expect(mockUpdateWhere).toHaveBeenCalledWith({ col: 'id', val: 5 });
  });

  it('updateが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockUpdateWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(reopenSet(5)).rejects.toThrow('db error');
  });
});
