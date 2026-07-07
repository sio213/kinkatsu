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
      from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockSelectWhere(...args) }),
    }),
  };

  return {
    db: {
      insert: jest.fn().mockReturnValue({ values: (...args: unknown[]) => mockInsertValues(...args) }),
      update: jest.fn().mockReturnValue({ set: (...args: unknown[]) => mockUpdateSet(...args) }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockSelectWhere(...args) }),
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
}));

// getPreviousSets自体のクエリ検証はhistory-integration.test.tsが担当する。ここでは
// addExercisesToSession/replaceSessionExerciseがその結果をどう使うか（プリフィル vs
// フォールバック）だけを見たいため、戻り値を差し替えられるようモック化する
const mockGetPreviousSets = jest.fn();
jest.mock('@/lib/workout/history', () => ({
  getPreviousSets: (...args: unknown[]) => mockGetPreviousSets(...args),
}));

import {
  addExercisesToSession,
  endWorkoutSession,
  replaceSessionExercise,
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

  it('前回のセットが全カラムnull(✓未確定のまま何も入力せず終えたセッション)の場合、そのセットidはprefilledSetIdsに含めない（値の無い行がゴースト表示されるのを防ぐ）', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 100, exerciseId: 10 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 501 }, { id: 502 }]);

    const prefilled = await addExercisesToSession(1, [10]);

    expect(prefilled).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 100, kind: 'new', prefilledSetIds: [501] },
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

  it('入れ替え先の種目の前回セットが全カラムnullの場合、そのセットidはprefilledSetIdsに含めない', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ exerciseId: 10, sessionId: 3 }]);
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 701 }]);

    const prefilled = await replaceSessionExercise(7, 20);

    expect(prefilled).toEqual({
      sessionId: 3,
      exerciseId: 20,
      sessionExerciseId: 7,
      kind: 'swap',
      prefilledSetIds: [],
    });
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
