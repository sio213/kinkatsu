// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockSetsInsertValues: jest.Mock;
var mockSetsReturning: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockReturning: jest.Mock;
var mockSelectWhere: jest.Mock;

jest.mock('@/db/client', () => {
  // schemaは同じくモック済みのモジュールを参照する（呼び出し順ではなく、渡されたテーブル
  // オブジェクトの同一性でworkoutSessionExercises/setsどちらへのinsertかを振り分けるため）
  const schema = require('@/db/schema');

  mockReturning = jest.fn().mockResolvedValue([{ id: 1, startedAt: 0, endedAt: null }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: () => mockReturning() });
  // sets側のinsertはaddExercisesToSession/replaceSessionExerciseどちらも
  // .values(...).returning({id: sets.id}) という形でinsertされた行のidを取得するため、
  // workoutSessionExercises側と同じ「値を渡すとreturning可能なオブジェクトを返す」形にする
  mockSetsReturning = jest.fn().mockResolvedValue([]);
  mockSetsInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockSetsReturning(...args) });
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockSelectWhere = jest.fn().mockResolvedValue([]);

  // getActiveSessionは.where().orderBy().limit()とチェーンして最後にawaitする一方、
  // replaceSessionExercise等は.where()の返り値を直接awaitするだけ。mockSelectWhere()の
  // 戻り値(Promise)自体にorderBy/limitを生やし、どちらの呼び方でも同じ解決値を返せるようにする
  function selectWhere(...args: unknown[]) {
    const result = mockSelectWhere(...args) as Promise<unknown> & { orderBy?: unknown; limit?: unknown };
    result.orderBy = jest.fn().mockReturnValue(result);
    result.limit = jest.fn().mockReturnValue(result);
    return result;
  }

  const txInsert = jest.fn((table: unknown) => {
    if (table === schema.sets) {
      return { values: (...args: unknown[]) => mockSetsInsertValues(...args) };
    }
    return { values: (...args: unknown[]) => mockInsertValues(...args) };
  });

  const tx = {
    insert: txInsert,
    // replaceSessionExercise/swapExerciseOrderがtx.updateを使うため、db.updateと同じ
    // mockUpdateSet/mockUpdateWhereを共有する（テーブルの出し分けは不要、呼び出し順で見る）
    update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockUpdateSet(...args) }),
    // replaceSessionExerciseが既存セットを消すのに使う
    delete: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockDeleteWhere(...args) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => selectWhere(...args) }),
    }),
  };

  return {
    db: {
      insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockInsertValues(...args) }),
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockUpdateSet(...args) }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => selectWhere(...args) }),
      }),
      // addExercisesToSessionのトランザクション化に伴い、txにも同じselect/insertモックを渡す
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessions: { id: 'id', startedAt: 'startedAt', endedAt: 'endedAt' },
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId', orderIndex: 'orderIndex', exerciseId: 'exerciseId' },
  sets: {
    id: 'id',
    sessionId: 'sessionId',
    workoutSessionExerciseId: 'workoutSessionExerciseId',
    completedAt: 'completedAt',
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conditions) => ({ and: conditions })),
  desc: jest.fn((col) => ({ desc: col })),
  isNull: jest.fn((col) => ({ isNull: col })),
}));

// getPreviousSets自体のクエリ検証はhistory-integration.test.tsが担当する。ここでは
// addExercisesToSession/replaceSessionExerciseがその結果をどう使うか（プリフィル vs
// フォールバック）だけを見たいため、戻り値を差し替えられるようモック化する
const mockGetPreviousSets = jest.fn();
jest.mock('@/lib/workout/history', () => ({
  getPreviousSets: (...args: unknown[]) => mockGetPreviousSets(...args),
  // hasAnyValueは値の絞り込みロジックそのものがこのファイルの検証対象なので、実装をモック化せず
  // 本物をそのまま使う（jest.requireActualで元モジュールから取り出す）
  hasAnyValue: jest.requireActual('@/lib/workout/history').hasAnyValue,
}));

// startWorkoutFromRoutineが読むルーティンの中身(種目・目標セット)はgetRoutineDetail経由。
// ルーティン側のクエリ組み立てそのものはlib/routines/db.test.tsが担当するため、ここでは
// startWorkoutFromRoutineがその結果をどうセッションに投入するかだけを見る
const mockGetRoutineDetail = jest.fn();
jest.mock('@/lib/routines/db', () => ({
  getRoutineDetail: (...args: unknown[]) => mockGetRoutineDetail(...args),
}));

import {
  addExercisesToSession,
  addRoutineExercisesToSession,
  createPastWorkoutSession,
  endWorkoutSession,
  getActiveSession,
  replaceSessionExercise,
  reorderSessionExercises,
  startPastWorkoutFromRoutine,
  startWorkoutFromRoutine,
  startWorkoutSession,
} from '@/lib/workout/session';

beforeEach(() => {
  jest.clearAllMocks();
  mockReturning.mockResolvedValue([{ id: 1, startedAt: 0, endedAt: null }]);
  mockSetsInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockSetsReturning(...args) });
  mockSetsReturning.mockResolvedValue([]);
  mockUpdateWhere.mockResolvedValue(undefined);
  mockDeleteWhere.mockResolvedValue(undefined);
  mockSelectWhere.mockResolvedValue([]);
  // 既定は「前回の記録なし」。プリフィルを検証するテストだけ個別にmockResolvedValueOnceで上書きする
  mockGetPreviousSets.mockResolvedValue([]);
  mockGetRoutineDetail.mockResolvedValue(null);
});

describe('startWorkoutSession', () => {
  it('現在時刻でstartedAt/createdAt/updatedAtを揃えてinsertし、insertされた行を返す', async () => {
    const before = Date.now();
    const result = await startWorkoutSession();
    const after = Date.now();

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.startedAt).toBeGreaterThanOrEqual(before);
    expect(payload.startedAt).toBeLessThanOrEqual(after);
    expect(payload.createdAt).toBe(payload.startedAt);
    expect(payload.updatedAt).toBe(payload.startedAt);
    expect(result).toEqual({ id: 1, startedAt: 0, endedAt: null });
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockReturning.mockRejectedValueOnce(new Error('db error'));
    await expect(startWorkoutSession()).rejects.toThrow('db error');
  });
});

// カレンダー過去日パネル「記録を追加」用（2026-07-20）。startWorkoutSessionと違い、
// startedAt/endedAtの両方に呼び出し側から渡した過去日時をそのまま書き込む
describe('createPastWorkoutSession', () => {
  it('startedAtとendedAtの両方に渡した日時を同じ値で書き込む', async () => {
    const pastDate = new Date(2026, 6, 25, 12, 0, 0).getTime();
    await createPastWorkoutSession(pastDate);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.startedAt).toBe(pastDate);
    expect(payload.endedAt).toBe(pastDate);
    // createdAt/updatedAtは(startedAtとは別に)呼び出し時点の現在時刻を使う
    expect(payload.createdAt).toBe(payload.updatedAt);
    expect(payload.createdAt).not.toBe(pastDate);
  });

  it('insertされた行を返す', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 7, startedAt: 100, endedAt: 100 }]);
    const result = await createPastWorkoutSession(100);
    expect(result).toEqual({ id: 7, startedAt: 100, endedAt: 100 });
  });
});

describe('endWorkoutSession', () => {
  it('現在時刻でendedAt/updatedAtをセットし、対象のidでupdateする', async () => {
    const before = Date.now();
    await endWorkoutSession(5);
    const after = Date.now();

    const payload = mockUpdateSet.mock.calls[0][0];
    expect(payload.endedAt).toBeGreaterThanOrEqual(before);
    expect(payload.endedAt).toBeLessThanOrEqual(after);
    expect(payload.updatedAt).toBe(payload.endedAt);
    expect(mockUpdateWhere).toHaveBeenCalledWith({ col: 'id', val: 5 });
  });

  it('updateが失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockUpdateWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(endWorkoutSession(1)).rejects.toThrow('db error');
  });
});

describe('reorderSessionExercises', () => {
  it('空配列を渡すと何も更新しない(no-op)', async () => {
    await reorderSessionExercises(1, []);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it('渡した配列の順序通りに0始まりのorderIndexを振り直す', async () => {
    await reorderSessionExercises(1, [30, 10, 20]);

    expect(mockUpdateSet).toHaveBeenNthCalledWith(1, { orderIndex: 0 });
    expect(mockUpdateSet).toHaveBeenNthCalledWith(2, { orderIndex: 1 });
    expect(mockUpdateSet).toHaveBeenNthCalledWith(3, { orderIndex: 2 });
  });

  it('各行の更新をsessionExerciseId・sessionId両方でスコープする(他セッションの行を誤って書き換えない)', async () => {
    await reorderSessionExercises(7, [30]);

    expect(mockUpdateWhere).toHaveBeenCalledWith({
      and: [
        { col: 'id', val: 30 },
        { col: 'sessionId', val: 7 },
      ],
    });
  });

  it('要素が1件だけでもorderIndex=0で更新する', async () => {
    await reorderSessionExercises(1, [42]);
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ orderIndex: 0 });
  });

  it('更新が失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockUpdateWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(reorderSessionExercises(1, [10, 20])).rejects.toThrow('db error');
  });

  it('3件中2件目の更新が失敗した場合、3件目の更新は試みない（ループは失敗時点で止まる）', async () => {
    mockUpdateWhere
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db error'));

    await expect(reorderSessionExercises(1, [30, 10, 20])).rejects.toThrow('db error');

    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
  });
});

describe('addExercisesToSession', () => {
  it('exerciseIdsが空なら何もinsertしない', async () => {
    await addExercisesToSession(1, []);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('既存の種目が無いセッションではorderIndexを0から振る', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([
      { id: 100, exerciseId: 10 },
      { id: 101, exerciseId: 11 },
    ]);
    await addExercisesToSession(1, [10, 11]);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual([
      { sessionId: 1, exerciseId: 10, orderIndex: 0, createdAt: expect.any(Number) },
      { sessionId: 1, exerciseId: 11, orderIndex: 1, createdAt: expect.any(Number) },
    ]);
  });

  it('既存の種目があるセッションでは最大orderIndexの続きから振る（並び順を保持）', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 2 }]);
    mockReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 20 }]);
    await addExercisesToSession(1, [20]);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual([
      { sessionId: 1, exerciseId: 20, orderIndex: 3, createdAt: expect.any(Number) },
    ]);
  });

  it('追加した種目カードごとに、値が空でsetNumber=1のセットを1件自動生成する', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([
      { id: 100, exerciseId: 10 },
      { id: 101, exerciseId: 11 },
    ]);
    await addExercisesToSession(1, [10, 11]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
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
      },
      {
        sessionId: 1,
        exerciseId: 11,
        workoutSessionExerciseId: 101,
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

  it('exerciseIdsが空ならsetsのinsertも呼ばれない', async () => {
    await addExercisesToSession(1, []);
    expect(mockSetsInsertValues).not.toHaveBeenCalled();
  });

  it('既存カードがあるセッションに1件追加したときも、その1件分の自動セットが生成される', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 2 }]);
    mockReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 20 }]);
    await addExercisesToSession(1, [20]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 1,
        exerciseId: 20,
        workoutSessionExerciseId: 200,
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

  it('setsペイロードに余分なキー(undefinedの値含む)が混入していない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    await addExercisesToSession(1, [10]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(Object.keys(setsPayload[0]).sort()).toEqual(
      [
        'sessionId',
        'exerciseId',
        'workoutSessionExerciseId',
        'setNumber',
        'weight',
        'reps',
        'durationSeconds',
        'distanceMeters',
        'completedAt',
        'createdAt',
      ].sort(),
    );
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockInsertValues.mockImplementationOnce(() => {
      throw new Error('db error');
    });
    await expect(addExercisesToSession(1, [10])).rejects.toThrow('db error');
  });

  it('setsのinsertが失敗した場合もエラーを握りつぶさずthrowする（fire-and-forget禁止）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockSetsReturning.mockRejectedValueOnce(new Error('sets insert error'));
    await expect(addExercisesToSession(1, [10])).rejects.toThrow('sets insert error');
  });

  it('getPreviousSetsが失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockGetPreviousSets.mockRejectedValueOnce(new Error('query error'));
    await expect(addExercisesToSession(1, [10])).rejects.toThrow('query error');
  });

  it('前回の記録がある種目は、値をコピーしたセット列(completedAt:null)を作り、実際に挿入されたセットidをprefilledSetIdsとして返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 501 }, { id: 502 }]);

    const prefilled = await addExercisesToSession(1, [10]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 1,
        exerciseId: 10,
        workoutSessionExerciseId: 100,
        setNumber: 1,
        weight: 60,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
      {
        sessionId: 1,
        exerciseId: 10,
        workoutSessionExerciseId: 100,
        setNumber: 2,
        weight: 60,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(prefilled).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [501, 502] },
    ]);
  });

  it('前回の記録が無い種目はprefilledSetIdsが空配列になる（空の1件は挿入されるがゴースト対象外）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const prefilled = await addExercisesToSession(1, [10]);

    expect(prefilled).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [] },
    ]);
  });

  it('前回のセットに全カラムnullの行(✓未確定のまま何も入力せず終えたセッション)が混ざっている場合、その行はコピー対象から除外し余分な空行を作らない（バグ回帰防止: 追加した種目に余分な空行が出る不具合）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
      { setNumber: 3, weight: 55, reps: 8, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 501 }, { id: 502 }]);

    const prefilled = await addExercisesToSession(1, [10]);

    // 全カラムnullの行(setNumber:2)は挿入されず、値のある2件だけが1,2に振り直されてコピーされる
    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload.map((s: { setNumber: number; weight: number | null }) => [s.setNumber, s.weight])).toEqual([
      [1, 60],
      [2, 55],
    ]);
    expect(prefilled).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [501, 502] },
    ]);
  });

  it('複数種目を同時に追加した場合、それぞれのカードに対応するprefilledSetIdsが正しく振り分けられる', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([
      { id: 100, exerciseId: 10 },
      { id: 101, exerciseId: 11 },
    ]);
    mockGetPreviousSets.mockImplementation(async (_tx: unknown, exerciseId: number) =>
      exerciseId === 10
        ? [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null }]
        : [],
    );
    // exerciseId=10のカード(1セット)→id:501、exerciseId=11のカード(前回記録無し、空の1件)→id:502
    mockSetsReturning.mockResolvedValueOnce([{ id: 501 }, { id: 502 }]);

    const prefilled = await addExercisesToSession(1, [10, 11]);

    expect(prefilled).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [501] },
      { sessionId: 1, exerciseId: 11, sessionExerciseId: 101, kind: 'new', prefilledSetIds: [] },
    ]);
  });
});

describe('replaceSessionExercise', () => {
  it('既存のexerciseIdと同じ場合は何もしない（no-op）', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 5, sessionId: 1 }]);
    await replaceSessionExercise(1, 5);

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockSetsInsertValues).not.toHaveBeenCalled();
  });

  it('対象のworkoutSessionExercises行が見つからない場合は何もしない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await replaceSessionExercise(1, 5);

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockSetsInsertValues).not.toHaveBeenCalled();
  });

  it('入れ替えると、workoutSessionExercises.exerciseIdを更新し、既存セットを全部消して新規登録と同じ空の1セットだけを作り直す', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 3 }]);

    await replaceSessionExercise(7, 20);

    expect(mockUpdateSet).toHaveBeenCalledWith({ exerciseId: 20 });
    expect(mockUpdateWhere).toHaveBeenCalledWith({ col: 'id', val: 7 });
    expect(mockDeleteWhere).toHaveBeenCalledWith({ col: 'workoutSessionExerciseId', val: 7 });

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 3,
        exerciseId: 20,
        workoutSessionExerciseId: 7,
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

  it('workoutSessionExercises更新→セット削除→セット再作成の順で実行する', async () => {
    const callOrder: string[] = [];
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 1 }]);
    mockUpdateWhere.mockImplementationOnce(async () => {
      callOrder.push('update');
    });
    mockDeleteWhere.mockImplementationOnce(async () => {
      callOrder.push('delete');
    });
    mockSetsReturning.mockImplementationOnce(async () => {
      callOrder.push('insert');
      return [];
    });

    await replaceSessionExercise(1, 20);

    expect(callOrder).toEqual(['update', 'delete', 'insert']);
  });

  it('workoutSessionExercisesの更新が失敗した場合はエラーを握りつぶさずthrowする（呼び出し側でAlertを出すため）', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 1 }]);
    mockUpdateWhere.mockRejectedValueOnce(new Error('db error'));

    await expect(replaceSessionExercise(1, 20)).rejects.toThrow('db error');
  });

  it('セットの再作成が失敗した場合もエラーを握りつぶさずthrowする（fire-and-forget禁止）', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 1 }]);
    mockSetsReturning.mockRejectedValueOnce(new Error('sets insert error'));

    await expect(replaceSessionExercise(1, 20)).rejects.toThrow('sets insert error');
  });

  it('入れ替え先の種目に前回の記録があれば、そのセット列をコピーして実際に挿入されたセットidをprefilledSetIdsとして返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 3 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 100, reps: 5, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 701 }]);

    const prefilled = await replaceSessionExercise(7, 20);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 3,
        exerciseId: 20,
        workoutSessionExerciseId: 7,
        setNumber: 1,
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(prefilled).toEqual({
      sessionId: 3,
      exerciseId: 20,
      sessionExerciseId: 7,
      kind: 'swap',
      prefilledSetIds: [701],
    });
  });

  it('入れ替え先の種目の前回セットが全カラムnullの場合、コピー対象から除外され空の1件だけが作られる', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 3 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 701 }]);

    const prefilled = await replaceSessionExercise(7, 20);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toHaveLength(1);
    expect(setsPayload[0].weight).toBeNull();
    expect(prefilled).toEqual({
      sessionId: 3,
      exerciseId: 20,
      sessionExerciseId: 7,
      kind: 'swap',
      prefilledSetIds: [],
    });
  });

  it('入れ替え先の種目の前回セットに全カラムnullの行が混ざっている場合、その行だけコピー対象から除外する（バグ回帰防止）', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 3 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 701 }]);

    await replaceSessionExercise(7, 20);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toHaveLength(1);
    expect(setsPayload[0]).toMatchObject({ setNumber: 1, weight: 60, reps: 8 });
  });

  it('入れ替え先の種目に前回の記録が無ければprefilledSetIdsが空配列のカードを返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 1 }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 800 }]);

    const prefilled = await replaceSessionExercise(1, 20);

    expect(prefilled).toEqual({
      sessionId: 1,
      exerciseId: 20,
      sessionExerciseId: 1,
      kind: 'swap',
      prefilledSetIds: [],
    });
  });
});

describe('getActiveSession', () => {
  it('endedAtがnullの行が無ければnullを返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    expect(await getActiveSession()).toBeNull();
  });

  it('endedAtがnullの行があればその行を返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 9, startedAt: 100, endedAt: null }]);
    expect(await getActiveSession()).toEqual({ id: 9, startedAt: 100, endedAt: null });
  });

  it('クエリが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockSelectWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(getActiveSession()).rejects.toThrow('db error');
  });
});

describe('startWorkoutFromRoutine', () => {
  it('該当ルーティンが見つからない場合はnullを返し、セッションも作らない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce(null);

    const result = await startWorkoutFromRoutine(999);

    expect(result).toBeNull();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('種目が0件のルーティン(通常はzodバリデーションで防がれるが念のため)はnullを返し、空のセッションを作らない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({ routine: { id: 1, name: 'A' }, reminder: null, exercises: [] });

    const result = await startWorkoutFromRoutine(1);

    expect(result).toBeNull();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('新規セッションを作り、ルーティンの種目をorderIndex0から連番でカードに追加する', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: '胸トレ' },
      reminder: null,
      exercises: [
        { id: 501, exerciseId: 10, sets: [] },
        { id: 502, exerciseId: 11, sets: [] },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]); // このセッションにまだカードが無い
    mockReturning
      .mockResolvedValueOnce([{ id: 55, startedAt: 0, endedAt: null }]) // workoutSessions insert
      .mockResolvedValueOnce([
        { id: 100, exerciseId: 10 },
        { id: 101, exerciseId: 11 },
      ]); // workoutSessionExercises insert

    const result = await startWorkoutFromRoutine(1);

    expect(result?.sessionId).toBe(55);
    const sessionPayload = mockInsertValues.mock.calls[0][0];
    expect(sessionPayload).toEqual({
      startedAt: expect.any(Number),
      endedAt: null,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    const cardsPayload = mockInsertValues.mock.calls[1][0];
    expect(cardsPayload).toEqual([
      { sessionId: 55, exerciseId: 10, orderIndex: 0, createdAt: expect.any(Number) },
      { sessionId: 55, exerciseId: 11, orderIndex: 1, createdAt: expect.any(Number) },
    ]);
  });

  it('ルーティンのrouteExerciseId単位で目標セットを引き当てる(同じ種目が複数カードにあっても値が混ざらない)', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [
        { id: 501, exerciseId: 10, sets: [{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null }] },
        { id: 502, exerciseId: 10, sets: [{ setNumber: 1, weight: 20, reps: 15, durationSeconds: null, distanceMeters: null }] },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning
      .mockResolvedValueOnce([{ id: 55, startedAt: 0, endedAt: null }])
      .mockResolvedValueOnce([
        { id: 100, exerciseId: 10 },
        { id: 101, exerciseId: 10 },
      ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }, { id: 901 }]);

    const result = await startWorkoutFromRoutine(1);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 55,
        exerciseId: 10,
        workoutSessionExerciseId: 100,
        setNumber: 1,
        weight: 60,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
      {
        sessionId: 55,
        exerciseId: 10,
        workoutSessionExerciseId: 101,
        setNumber: 1,
        weight: 20,
        reps: 15,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result?.cards).toEqual([
      { sessionId: 55, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [900] },
      { sessionId: 55, exerciseId: 10, sessionExerciseId: 101, kind: 'new', prefilledSetIds: [901] },
    ]);
  });

  it('routineSetsに全カラムnullの行(空セット行)が混ざっている場合、その行だけコピー対象から除外する(addExercisesToSessionと同じhasAnyValue絞り込みがroutineSets経由でも効くことの確認)', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [
        {
          id: 501,
          exerciseId: 10,
          sets: [
            { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
            { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
            { setNumber: 3, weight: 55, reps: 8, durationSeconds: null, distanceMeters: null },
          ],
        },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning
      .mockResolvedValueOnce([{ id: 55, startedAt: 0, endedAt: null }])
      .mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }, { id: 901 }]);

    const result = await startWorkoutFromRoutine(1);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload.map((s: { setNumber: number; weight: number | null }) => [s.setNumber, s.weight])).toEqual([
      [1, 60],
      [2, 55],
    ]);
    expect(result?.cards).toEqual([
      { sessionId: 55, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [900, 901] },
    ]);
  });

  it('目標セットが1件も無い種目は、値が空でsetNumber=1のセットにフォールバックしprefilledSetIdsは空になる', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning
      .mockResolvedValueOnce([{ id: 55, startedAt: 0, endedAt: null }])
      .mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await startWorkoutFromRoutine(1);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 55,
        exerciseId: 10,
        workoutSessionExerciseId: 100,
        setNumber: 1,
        weight: null,
        reps: null,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result?.cards).toEqual([
      { sessionId: 55, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [] },
    ]);
  });

  it('getRoutineDetailが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockRejectedValueOnce(new Error('db error'));
    await expect(startWorkoutFromRoutine(1)).rejects.toThrow('db error');
  });

  it('セッションのinsertが失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    mockReturning.mockRejectedValueOnce(new Error('db error'));
    await expect(startWorkoutFromRoutine(1)).rejects.toThrow('db error');
  });
});

// カレンダー過去日パネル「記録を追加」→「ルーティン」経由用（2026-07-20）。
// createRoutineSession共通化により種目投入ロジック自体はstartWorkoutFromRoutineと同じため、
// ここではstartedAt/endedAtの書き込み内容と、種目0件時の防御が引き継がれていることだけを見る
describe('startPastWorkoutFromRoutine', () => {
  it('startedAtとendedAtの両方に渡した過去日時を同じ値で書き込む', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: '胸トレ' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 55, startedAt: 0, endedAt: 0 }]).mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    const pastDate = new Date(2026, 6, 25, 12, 0, 0).getTime();

    const result = await startPastWorkoutFromRoutine(1, pastDate);

    expect(result?.sessionId).toBe(55);
    const sessionPayload = mockInsertValues.mock.calls[0][0];
    expect(sessionPayload.startedAt).toBe(pastDate);
    expect(sessionPayload.endedAt).toBe(pastDate);
  });

  it('該当ルーティンが見つからない場合はnullを返し、セッションも作らない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce(null);
    const result = await startPastWorkoutFromRoutine(999, Date.now());
    expect(result).toBeNull();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('種目が0件のルーティンはnullを返し、空のセッションを作らない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({ routine: { id: 1, name: 'A' }, reminder: null, exercises: [] });
    const result = await startPastWorkoutFromRoutine(1, Date.now());
    expect(result).toBeNull();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」用。startWorkoutFromRoutineと違い
// 新規セッションを作らず既存sessionIdへ追加する点、選んだselections(routineExerciseId)で
// detail.exercisesを絞り込む点が固有のロジックのため、そこを中心に検証する。目標セットの
// コピー・全カラムnull除外・setNumber振り直し自体はinsertRoutineCardsIntoSession共通のため
// startWorkoutFromRoutine側のテストで既にカバーされている
describe('addRoutineExercisesToSession', () => {
  it('selectionsが空なら何も取得・insertせず空配列を返す', async () => {
    const result = await addRoutineExercisesToSession(1, 99, []);
    expect(result).toEqual([]);
    expect(mockGetRoutineDetail).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('存在しないroutineIdの場合は空配列を返しinsertしない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce(null);
    const result = await addRoutineExercisesToSession(1, 999, [{ routineExerciseId: 501 }]);
    expect(result).toEqual([]);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('selectionsが全て存在しない(削除済み等の)routineExerciseIdの場合はinsertしない', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    const result = await addRoutineExercisesToSession(1, 1, [{ routineExerciseId: 999 }]);
    expect(result).toEqual([]);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('有効なidと無効なidが混在する場合、有効な分だけ処理する(クライアントの値を信用しない)', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [
        { id: 501, exerciseId: 10, sets: [] },
        { id: 502, exerciseId: 11, sets: [] },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);

    await addRoutineExercisesToSession(7, 1, [{ routineExerciseId: 501 }, { routineExerciseId: 999 }]);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual([{ sessionId: 7, exerciseId: 10, orderIndex: 0, createdAt: expect.any(Number) }]);
  });

  it('selectionsの並びに関わらず、ルーティン内の表示順(orderIndex順)で処理・挿入される', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [
        { id: 501, exerciseId: 10, sets: [] },
        { id: 502, exerciseId: 11, sets: [] },
        { id: 503, exerciseId: 12, sets: [] },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([
      { id: 200, exerciseId: 10 },
      { id: 201, exerciseId: 12 },
    ]);

    // クリック順は503→501の逆順だが、表示順は501,503のはず
    await addRoutineExercisesToSession(7, 1, [{ routineExerciseId: 503 }, { routineExerciseId: 501 }]);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload.map((p: { exerciseId: number }) => p.exerciseId)).toEqual([10, 12]);
  });

  it('既存カードがあるセッションへの追加は、既存の続き番号からorderIndexを振る', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 1 }]);
    mockReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);

    await addRoutineExercisesToSession(7, 1, [{ routineExerciseId: 501 }]);

    const payload = mockInsertValues.mock.calls[0][0];
    expect(payload).toEqual([{ sessionId: 7, exerciseId: 10, orderIndex: 2, createdAt: expect.any(Number) }]);
  });

  it('選んだ種目の目標セットがコピーされprefilledSetIdsが返る', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [
        {
          id: 501,
          exerciseId: 10,
          sets: [{ setNumber: 1, weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null }],
        },
      ],
    });
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await addRoutineExercisesToSession(7, 1, [{ routineExerciseId: 501 }]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 7,
        exerciseId: 10,
        workoutSessionExerciseId: 200,
        setNumber: 1,
        weight: 62.5,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result).toEqual([
      { sessionId: 7, exerciseId: 10, sessionExerciseId: 200, kind: 'new', prefilledSetIds: [900] },
    ]);
  });

  it('getRoutineDetailが失敗した場合はエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockRejectedValueOnce(new Error('db error'));
    await expect(addRoutineExercisesToSession(1, 1, [{ routineExerciseId: 501 }])).rejects.toThrow('db error');
  });

  it('insertが失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockGetRoutineDetail.mockResolvedValueOnce({
      routine: { id: 1, name: 'A' },
      reminder: null,
      exercises: [{ id: 501, exerciseId: 10, sets: [] }],
    });
    mockReturning.mockRejectedValueOnce(new Error('insert error'));
    await expect(addRoutineExercisesToSession(1, 1, [{ routineExerciseId: 501 }])).rejects.toThrow('insert error');
  });
});
