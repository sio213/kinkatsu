// addHistoryCardsToSessionはworkoutSessionExercisesへのinsertと、getPreviousSetsForCard
// （sets側の.where().orderBy()チェーン）の両方を使うため、session.test.tsのtxモック
// （orderByに未対応）とhistory-load.test.tsのtxモック（insertに未対応）のどちらもそのままは
// 使えない。両方を満たす専用のtxモックをこのファイルで用意する
/* eslint-disable no-var */
var mockWseSelectWhere: jest.Mock;
var mockSetsOrderBy: jest.Mock;
var mockWseInsertValues: jest.Mock;
var mockWseReturning: jest.Mock;
var mockSetsInsertValues: jest.Mock;
var mockSetsReturning: jest.Mock;

jest.mock('@/db/client', () => {
  const schema = require('@/db/schema');

  mockWseSelectWhere = jest.fn().mockResolvedValue([]);
  mockSetsOrderBy = jest.fn().mockResolvedValue([]);
  mockWseReturning = jest.fn().mockResolvedValue([]);
  mockWseInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockWseReturning(...args) });
  mockSetsReturning = jest.fn().mockResolvedValue([]);
  mockSetsInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockSetsReturning(...args) });

  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        if (table === schema.workoutSessionExercises) {
          return { where: (...args: unknown[]) => mockWseSelectWhere(...args) };
        }
        return {
          where: jest.fn(() => ({
            orderBy: (...args: unknown[]) => mockSetsOrderBy(...args),
          })),
        };
      }),
    })),
    insert: jest.fn((table: unknown) => {
      if (table === schema.sets) {
        return { values: (...args: unknown[]) => mockSetsInsertValues(...args) };
      }
      return { values: (...args: unknown[]) => mockWseInsertValues(...args) };
    }),
  };

  return {
    db: {
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  workoutSessionExercises: { id: 'id', sessionId: 'sessionId', orderIndex: 'orderIndex', exerciseId: 'exerciseId' },
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

import { addHistoryCardsToSession } from '@/lib/workout/session';

beforeEach(() => {
  jest.clearAllMocks();
  mockWseSelectWhere.mockResolvedValue([]);
  mockSetsOrderBy.mockResolvedValue([]);
  mockWseReturning.mockResolvedValue([]);
  mockWseInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockWseReturning(...args) });
  mockSetsReturning.mockResolvedValue([]);
  mockSetsInsertValues.mockReturnValue({ returning: (...args: unknown[]) => mockSetsReturning(...args) });
});

describe('addHistoryCardsToSession', () => {
  it('selectionsが空なら何もinsertしない', async () => {
    const result = await addHistoryCardsToSession(1, []);
    expect(result).toEqual([]);
    expect(mockWseInsertValues).not.toHaveBeenCalled();
  });

  it('選んだ過去カードごとに新規カードを追加し、orderIndexは既存の続き番号から振る', async () => {
    mockWseSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 2 }]);
    mockWseReturning.mockResolvedValueOnce([
      { id: 200, exerciseId: 10 },
      { id: 201, exerciseId: 20 },
    ]);

    await addHistoryCardsToSession(1, [
      { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
      { exerciseId: 20, sourceWorkoutSessionExerciseId: 501 },
    ]);

    const payload = mockWseInsertValues.mock.calls[0][0];
    expect(payload).toEqual([
      { sessionId: 1, exerciseId: 10, orderIndex: 3, createdAt: expect.any(Number) },
      { sessionId: 1, exerciseId: 20, orderIndex: 4, createdAt: expect.any(Number) },
    ]);
  });

  it('新規カードのそれぞれに、選んだ過去カード自身（sourceWorkoutSessionExerciseId）のセット列をコピーする', async () => {
    mockWseReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([
      { setNumber: 1, weight: 62.5, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }, { id: 901 }]);

    const result = await addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 1,
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
      {
        sessionId: 1,
        exerciseId: 10,
        workoutSessionExerciseId: 200,
        setNumber: 2,
        weight: 60,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: null,
        createdAt: expect.any(Number),
      },
    ]);
    expect(result).toEqual([
      { sessionId: 1, exerciseId: 10, sessionExerciseId: 200, kind: 'history', prefilledSetIds: [900, 901] },
    ]);
  });

  it('同じexerciseIdの過去カードを2枚選んでも、それぞれ別カードとして追加し混ざらない（ウォームアップ+本番の日を丸ごと読み込む想定）', async () => {
    mockWseReturning.mockResolvedValueOnce([
      { id: 200, exerciseId: 10 },
      { id: 201, exerciseId: 10 },
    ]);
    mockSetsOrderBy
      .mockResolvedValueOnce([{ setNumber: 1, weight: 40, reps: 12, durationSeconds: null, distanceMeters: null }])
      .mockResolvedValueOnce([{ setNumber: 1, weight: 80, reps: 5, durationSeconds: null, distanceMeters: null }]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }, { id: 901 }]);

    await addHistoryCardsToSession(1, [
      { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }, // ウォームアップカード
      { exerciseId: 10, sourceWorkoutSessionExerciseId: 501 }, // 本番カード
    ]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload.map((s: { workoutSessionExerciseId: number; weight: number }) => [s.workoutSessionExerciseId, s.weight])).toEqual([
      [200, 40],
      [201, 80],
    ]);
  });

  it('コピー元カードにセットが無い場合、値が空でsetNumber=1のセットを1件だけ作りprefilledSetIdsは空になる', async () => {
    mockWseReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toEqual([
      {
        sessionId: 1,
        exerciseId: 10,
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
    expect(result[0].prefilledSetIds).toEqual([]);
  });

  it('コピー元のセットに全カラムnullの行が混ざっている場合、その行だけコピー対象から除外する', async () => {
    mockWseReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]);

    const setsPayload = mockSetsInsertValues.mock.calls[0][0];
    expect(setsPayload).toHaveLength(1);
    expect(setsPayload[0].weight).toBe(60);
    expect(result[0].prefilledSetIds).toEqual([900]);
  });

  it('insertが失敗した場合はエラーを握りつぶさずthrowする（fire-and-forget禁止）', async () => {
    mockWseReturning.mockRejectedValueOnce(new Error('insert error'));
    await expect(
      addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]),
    ).rejects.toThrow('insert error');
  });

  it('過去カードのセット取得(getPreviousSetsForCard)が2枚目で失敗した場合もエラーを握りつぶさずthrowする', async () => {
    mockWseReturning.mockResolvedValueOnce([
      { id: 200, exerciseId: 10 },
      { id: 201, exerciseId: 20 },
    ]);
    mockSetsOrderBy
      .mockResolvedValueOnce([{ setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null }])
      .mockRejectedValueOnce(new Error('query error'));

    await expect(
      addHistoryCardsToSession(1, [
        { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
        { exerciseId: 20, sourceWorkoutSessionExerciseId: 501 },
      ]),
    ).rejects.toThrow('query error');
  });

  it('workoutSessionExercisesのinsertは成功したがsetsのinsertが失敗した場合もthrowする（部分成功を許さない）', async () => {
    mockWseReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);
    mockSetsReturning.mockRejectedValueOnce(new Error('sets insert error'));

    await expect(
      addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]),
    ).rejects.toThrow('sets insert error');
  });

  it('今日のセッションに既に同じ種目のカードがあっても上書きせず、新規カードとして追加する', async () => {
    mockWseSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }]); // 既にexerciseId:10のカードが1件ある想定
    mockWseReturning.mockResolvedValueOnce([{ id: 300, exerciseId: 10 }]);

    await addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 500 }]);

    const payload = mockWseInsertValues.mock.calls[0][0];
    expect(payload).toEqual([{ sessionId: 1, exerciseId: 10, orderIndex: 1, createdAt: expect.any(Number) }]);
  });

  it('選んだ過去カード（sourceWorkoutSessionExerciseId）が既に削除されている等で見つからない場合、値が空でsetNumber=1のセットを1件だけ作りエラーにはしない', async () => {
    mockWseReturning.mockResolvedValueOnce([{ id: 200, exerciseId: 10 }]);
    mockSetsOrderBy.mockResolvedValueOnce([]); // 削除済み等でコピー元のセットが見つからない
    mockSetsReturning.mockResolvedValueOnce([{ id: 900 }]);

    const result = await addHistoryCardsToSession(1, [{ exerciseId: 10, sourceWorkoutSessionExerciseId: 999 }]);

    expect(result[0]).toEqual({ sessionId: 1, exerciseId: 10, sessionExerciseId: 200, kind: 'history', prefilledSetIds: [] });
  });
});
