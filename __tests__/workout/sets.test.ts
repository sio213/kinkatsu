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
    setNumber: 'setNumber',
    completedAt: 'completedAt',
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ and: conds })),
  desc: jest.fn((col) => ({ col, dir: 'desc' })),
  sql: Object.assign(
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    { raw: jest.fn() },
  ),
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
  it('既存セットが無い種目ではsetNumberを1から振る', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ maxSetNumber: null }]));
    await addSet(1, 10);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual({
      sessionId: 1,
      exerciseId: 10,
      setNumber: 1,
      completedAt: null,
      createdAt: expect.any(Number),
    });
  });

  it('既存セットがある種目では最大setNumberの続きから振る', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ maxSetNumber: 2 }]));
    await addSet(1, 10);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.setNumber).toBe(3);
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ maxSetNumber: null }]));
    mockInsertValues.mockRejectedValueOnce(new Error('db error'));
    await expect(addSet(1, 10)).rejects.toThrow('db error');
  });
});

describe('deleteLastSet', () => {
  it('セットが0件のときは何もしない', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([]));
    await deleteLastSet(1, 10);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('setNumberが最大のセットを削除する（DESC+LIMIT1で先頭行を取得）', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ id: 103 }]));
    await deleteLastSet(1, 10);
    expect(mockDeleteWhere).toHaveBeenCalledWith({ col: 'id', val: 103 });
  });

  it('deleteが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockSelectWhere.mockReturnValueOnce(mockMakeSelectChain([{ id: 101 }]));
    mockDeleteWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(deleteLastSet(1, 10)).rejects.toThrow('db error');
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
