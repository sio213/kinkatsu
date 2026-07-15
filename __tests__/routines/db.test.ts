// FK cascade等の実DB挙動はdb-integration.test.tsが担当する。ここではlib/routines/db.tsの各関数が
// どのテーブルに対してどの順番で操作を発行するか（session.test.tsと同じモック方針）を検証する。
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockReturning: jest.Mock;
var mockUpdateSet: jest.Mock;
var mockUpdateWhere: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockSelectWhere: jest.Mock;
var mockSelectFrom: jest.Mock;

jest.mock('@/db/client', () => {
  const schema = require('@/db/schema');

  mockReturning = jest.fn().mockResolvedValue([{ id: 1 }]);
  mockInsertValues = jest.fn().mockReturnValue({ returning: (...args: unknown[]) => mockReturning(...args) });
  mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  mockUpdateSet = jest.fn().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  mockSelectWhere = jest.fn().mockResolvedValue([]);
  // 呼び出し側によって`.from(table)`を直接await(createRoutineのorderIndex走査)、
  // `.from(table).where(...)`をawait(getRoutineDetailのroutines検索)、
  // `.from(table).where(...).orderBy(...)`をawait(routineExercises/routineSets検索)の
  // 3パターンがあるため、どの段でawaitされても同じ解決値を返せるようthenableを連鎖させる
  function makeSelectChain(table: unknown, priorArgs: unknown[]): {
    then: (resolve: (v: unknown) => void) => Promise<unknown>;
    where: (...args: unknown[]) => ReturnType<typeof makeSelectChain>;
    orderBy: (...args: unknown[]) => Promise<unknown>;
    innerJoin: (...args: unknown[]) => ReturnType<typeof makeSelectChain>;
  } {
    return {
      then: (resolve: (v: unknown) => void) => Promise.resolve(mockSelectWhere(table, ...priorArgs)).then(resolve),
      where: (...args: unknown[]) => makeSelectChain(table, [...priorArgs, ...args]),
      orderBy: (...args: unknown[]) => Promise.resolve(mockSelectWhere(table, ...priorArgs, ...args)),
      innerJoin: (...args: unknown[]) => makeSelectChain(table, [...priorArgs, ...args]),
    };
  }
  mockSelectFrom = jest.fn((table: unknown) => makeSelectChain(table, []));

  const tx = {
    insert: jest.fn((table: unknown) => ({
      values: (...args: unknown[]) => mockInsertValues(table, ...args),
    })),
    update: jest.fn((table: unknown) => ({
      set: (...args: unknown[]) => mockUpdateSet(table, ...args),
    })),
    delete: jest.fn((table: unknown) => ({
      where: (...args: unknown[]) => mockDeleteWhere(table, ...args),
    })),
    select: jest.fn(() => ({ from: (table: unknown) => mockSelectFrom(table) })),
  };

  return {
    db: {
      insert: jest.fn((table: unknown) => ({
        values: (...args: unknown[]) => mockInsertValues(table, ...args),
      })),
      update: jest.fn((table: unknown) => ({
        set: (...args: unknown[]) => mockUpdateSet(table, ...args),
      })),
      delete: jest.fn((table: unknown) => ({
        where: (...args: unknown[]) => mockDeleteWhere(table, ...args),
      })),
      select: jest.fn(() => ({ from: (table: unknown) => mockSelectFrom(table) })),
      transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    },
  };
});

jest.mock('@/db/schema', () => ({
  routines: { id: 'routines.id', orderIndex: 'routines.orderIndex', name: 'routines.name' },
  routineExercises: {
    id: 'routineExercises.id',
    routineId: 'routineExercises.routineId',
    exerciseId: 'routineExercises.exerciseId',
    orderIndex: 'routineExercises.orderIndex',
  },
  routineSets: {
    id: 'routineSets.id',
    routineExerciseId: 'routineSets.routineExerciseId',
    setNumber: 'routineSets.setNumber',
  },
  reminders: { id: 'reminders.id', routineId: 'reminders.routineId' },
  exercises: {
    id: 'exercises.id',
    name: 'exercises.name',
    category: 'exercises.category',
    measurementType: 'exercises.measurementType',
    source: 'exercises.source',
    slug: 'exercises.slug',
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ type: 'eq', col, val })),
  gt: jest.fn((col, val) => ({ type: 'gt', col, val })),
  inArray: jest.fn((col, val) => ({ type: 'inArray', col, val })),
  sql: jest.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

const mockDeleteReminder = jest.fn();
const mockCreateReminder = jest.fn();
const mockUpdateReminder = jest.fn();
jest.mock('@/lib/notifications/scheduler', () => ({
  deleteReminder: (...args: unknown[]) => mockDeleteReminder(...args),
  createReminder: (...args: unknown[]) => mockCreateReminder(...args),
  updateReminder: (...args: unknown[]) => mockUpdateReminder(...args),
}));

const mockGetPreviousSets = jest.fn();
jest.mock('@/lib/workout/history', () => ({
  getPreviousSets: (...args: unknown[]) => mockGetPreviousSets(...args),
  hasAnyValue: jest.requireActual('@/lib/workout/history').hasAnyValue,
}));

import { reminders, routineExercises, routineSets, routines } from '@/db/schema';
import {
  buildInitialRoutineSets,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  getRoutineDetail,
  swapRoutineOrder,
  updateRoutine,
} from '@/lib/routines/db';

beforeEach(() => {
  // jest.clearAllMocks()はmockResolvedValueOnceで積んだキューを消さないため、あるテストで
  // 使い切らなかったOnceの戻り値が次のテストに漏れ出す（テスト同士が独立しなくなる）。
  // ここでは各モックをmockReset()してキューごと空にし、素の実装を都度組み立て直す
  mockReturning.mockReset().mockResolvedValue([{ id: 1 }]);
  mockInsertValues.mockReset().mockReturnValue({ returning: () => mockReturning() });
  mockUpdateWhere.mockReset().mockResolvedValue(undefined);
  mockUpdateSet.mockReset().mockReturnValue({ where: (...args: unknown[]) => mockUpdateWhere(...args) });
  mockDeleteWhere.mockReset().mockResolvedValue(undefined);
  mockSelectWhere.mockReset().mockResolvedValue([]);
  mockDeleteReminder.mockReset().mockResolvedValue(undefined);
  mockCreateReminder.mockReset().mockResolvedValue(1);
  mockUpdateReminder.mockReset().mockResolvedValue(undefined);
  mockGetPreviousSets.mockReset().mockResolvedValue([]);
});

describe('createRoutine', () => {
  test('routinesが空のときorderIndexは0になる', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // existing routines一覧
    await createRoutine({ name: '胸の日', exercises: [] });

    expect(mockInsertValues).toHaveBeenCalledWith(
      routines,
      expect.objectContaining({ name: '胸の日', orderIndex: 0 }),
    );
  });

  test('既存routinesのorderIndexが飛び番でも最大値+1で採番される', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }, { orderIndex: 2 }]);
    await createRoutine({ name: '脚の日', exercises: [] });

    expect(mockInsertValues).toHaveBeenCalledWith(
      routines,
      expect.objectContaining({ orderIndex: 3 }),
    );
  });

  test('種目が0件なら routineExercises/routineSets へのinsertは発生しない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await createRoutine({ name: '有酸素', exercises: [] });

    expect(mockInsertValues).not.toHaveBeenCalledWith(routineExercises, expect.anything());
    expect(mockInsertValues).not.toHaveBeenCalledWith(routineSets, expect.anything());
  });

  test('種目のsetsが空配列なら、その種目のroutineSets insertはスキップされる', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning
      .mockResolvedValueOnce([{ id: 1 }]) // routines insert
      .mockResolvedValueOnce([{ id: 10 }]); // routineExercises insert

    await createRoutine({ name: '全身', exercises: [{ exerciseId: 5, sets: [] }] });

    expect(mockInsertValues).toHaveBeenCalledWith(
      routineExercises,
      expect.objectContaining({ exerciseId: 5, orderIndex: 0 }),
    );
    expect(mockInsertValues).not.toHaveBeenCalledWith(routineSets, expect.anything());
  });

  test('複数種目・複数セットでorderIndex(0始まり)とsetNumber(1始まり)が種目ごとに独立して振られる', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    mockReturning
      .mockResolvedValueOnce([{ id: 1 }]) // routines insert
      .mockResolvedValueOnce([{ id: 100 }]) // 種目1のroutineExercises insert
      .mockResolvedValueOnce([{ id: 200 }]); // 種目2のroutineExercises insert

    await createRoutine({
      name: '胸の日',
      exercises: [
        { exerciseId: 1, sets: [{ weight: 60, reps: 8, durationSeconds: null, distanceMeters: null }] },
        {
          exerciseId: 2,
          sets: [
            { weight: 10, reps: 12, durationSeconds: null, distanceMeters: null },
            { weight: 10, reps: 10, durationSeconds: null, distanceMeters: null },
          ],
        },
      ],
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      routineExercises,
      expect.objectContaining({ exerciseId: 1, orderIndex: 0 }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith(
      routineExercises,
      expect.objectContaining({ exerciseId: 2, orderIndex: 1 }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith(routineSets, [
      expect.objectContaining({ routineExerciseId: 100, setNumber: 1, weight: 60, reps: 8 }),
    ]);
    expect(mockInsertValues).toHaveBeenCalledWith(routineSets, [
      expect.objectContaining({ routineExerciseId: 200, setNumber: 1, weight: 10, reps: 12 }),
      expect.objectContaining({ routineExerciseId: 200, setNumber: 2, weight: 10, reps: 10 }),
    ]);
  });
});

describe('updateRoutine', () => {
  test('update(routines) → delete(routineExercises) → insert(routineExercises)の順で呼ばれる', async () => {
    const calls: string[] = [];
    mockUpdateSet.mockImplementation(() => {
      calls.push('update');
      return { where: mockUpdateWhere };
    });
    mockDeleteWhere.mockImplementation(() => {
      calls.push('delete');
      return Promise.resolve(undefined);
    });
    mockInsertValues.mockImplementation((table: unknown) => {
      if (table === routineExercises) calls.push('insertExercises');
      if (table === routineSets) calls.push('insertSets');
      return { returning: () => mockReturning() };
    });

    await updateRoutine(1, {
      name: '胸の日(改)',
      exercises: [{ exerciseId: 1, sets: [] }],
    });

    expect(calls).toEqual(['update', 'delete', 'insertExercises']);
  });

  test('種目0件で更新すると、既存のroutineExercisesは削除されるが再挿入はされない', async () => {
    await updateRoutine(1, { name: '空になったルーティン', exercises: [] });

    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalledWith(routineExercises, expect.anything());
  });
});

describe('createRoutine/updateRoutine: reminderPlanの反映', () => {
  test('createRoutineはreminderPlan未指定なら、紐づくリマインダーの検索すら行わない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // existing routines一覧のみ
    await createRoutine({ name: '胸の日', exercises: [] });

    expect(mockCreateReminder).not.toHaveBeenCalled();
    expect(mockUpdateReminder).not.toHaveBeenCalled();
    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
  });

  test('createRoutineはreminderPlan.inputがあれば、新しいroutineIdとルーティン名でcreateReminderを呼ぶ', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([]) // existing routines一覧
      .mockResolvedValueOnce([]); // 紐づくリマインダー検索(新規なので無し)

    await createRoutine(
      { name: '胸の日', exercises: [] },
      { enabled: true, input: { title: 'x', body: 'y', kind: 'interval', hour: 18, minute: 0, intervalDays: 1, enabled: true } },
    );

    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ routineId: 1, title: '胸の日', enabled: true }),
    );
    expect(mockUpdateReminder).not.toHaveBeenCalled();
  });

  test('createRoutineはreminderPlan.inputがnullなら、createReminderは呼ばれない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await createRoutine({ name: '有酸素', exercises: [] }, { enabled: false, input: null });

    expect(mockCreateReminder).not.toHaveBeenCalled();
    expect(mockDeleteReminder).not.toHaveBeenCalled();
  });

  test('updateRoutineは既存の紐づくリマインダーがあれば、そのidでupdateReminderを呼ぶ(createReminderは呼ばれない)', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 42 }]); // 紐づくリマインダー検索

    await updateRoutine(
      1,
      { name: '胸の日(改)', exercises: [] },
      { enabled: false, input: { title: 'x', body: 'y', kind: 'weekly', hour: 7, minute: 0, weekdays: [1], intervalDays: 7, enabled: true } },
    );

    expect(mockUpdateReminder).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ routineId: 1, title: '胸の日(改)', enabled: false }),
    );
    expect(mockCreateReminder).not.toHaveBeenCalled();
  });

  test('updateRoutineは既存の紐づくリマインダーが無ければ、createReminderを呼ぶ', async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    await updateRoutine(
      1,
      { name: '胸の日', exercises: [] },
      { enabled: true, input: { title: 'x', body: 'y', kind: 'interval', hour: 18, minute: 0, intervalDays: 1, enabled: true } },
    );

    expect(mockCreateReminder).toHaveBeenCalledWith(expect.objectContaining({ routineId: 1 }));
    expect(mockUpdateReminder).not.toHaveBeenCalled();
  });

  test('updateRoutineはreminderPlan.inputがnullで既存のリマインダーが残っていれば、防御的にdeleteReminderする', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 42 }]);

    await updateRoutine(1, { name: '胸の日', exercises: [] }, { enabled: false, input: null });

    expect(mockDeleteReminder).toHaveBeenCalledWith(42);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    expect(mockUpdateReminder).not.toHaveBeenCalled();
  });

  test('createRoutineはplan.enabled:falseでもreminderPlan.inputが設定済みなら、enabled:falseでcreateReminderを呼ぶ', async () => {
    mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await createRoutine(
      { name: '胸の日', exercises: [] },
      { enabled: false, input: { title: 'x', body: 'y', kind: 'interval', hour: 18, minute: 0, intervalDays: 1, enabled: true } },
    );

    expect(mockCreateReminder).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  // ルーティン本体(routines/routineExercises)は既にトランザクションで確定した後にリマインダーの
  // create/update/deleteを行うため、そこで失敗してもルーティン保存自体は失敗扱いにしない
  // (失敗扱いにすると、ユーザーが保存をリトライして既に保存済みのルーティンが重複作成されてしまう)
  test('createRoutineはリマインダーの登録(createReminder)が失敗しても例外を投げず、routineIdを返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCreateReminder.mockRejectedValueOnce(new Error('scheduling failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const routineId = await createRoutine(
      { name: '胸の日', exercises: [] },
      { enabled: true, input: { title: 'x', body: 'y', kind: 'interval', hour: 18, minute: 0, intervalDays: 1, enabled: true } },
    );

    expect(routineId).toBe(1);
  });

  test('updateRoutineはリマインダーの登録(updateReminder)が失敗しても例外を投げない', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 42 }]);
    mockUpdateReminder.mockRejectedValueOnce(new Error('scheduling failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      updateRoutine(
        1,
        { name: '胸の日', exercises: [] },
        { enabled: true, input: { title: 'x', body: 'y', kind: 'interval', hour: 18, minute: 0, intervalDays: 1, enabled: true } },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('deleteRoutine', () => {
  test('紐づくリマインダーが無ければdeleteReminderは呼ばれず、routinesだけ削除される', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // linked reminders検索

    await deleteRoutine(1);

    expect(mockDeleteReminder).not.toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalledWith(routines, expect.anything());
  });

  test('紐づくリマインダーが1件あれば、deleteReminder→routines削除の順で実行される', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 42 }]);
    const calls: string[] = [];
    mockDeleteReminder.mockImplementation(async (id: number) => {
      calls.push(`deleteReminder:${id}`);
    });
    mockDeleteWhere.mockImplementation(() => {
      calls.push('deleteRoutines');
      return Promise.resolve(undefined);
    });

    await deleteRoutine(1);

    expect(calls).toEqual(['deleteReminder:42', 'deleteRoutines']);
  });

  test('紐づくリマインダーが複数ある(本来想定外だが)場合、防御的に全件deleteReminderされる', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await deleteRoutine(1);

    expect(mockDeleteReminder).toHaveBeenCalledTimes(2);
    expect(mockDeleteReminder).toHaveBeenNthCalledWith(1, 1);
    expect(mockDeleteReminder).toHaveBeenNthCalledWith(2, 2);
  });
});

describe('duplicateRoutine', () => {
  test('存在しないroutineIdはエラーを投げ、以降のinsert/updateは発生しない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // source検索(該当なし)

    await expect(duplicateRoutine(999)).rejects.toThrow('routine not found: 999');
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  // orderIndexのシフトは対象行数分ループでUPDATEを発行するとN+1になるため、1本のUPDATE文
  // (sql`${routines.orderIndex} + 1`)で後続カード全体を一括更新する(@codereview指摘)。
  // このUPDATEは新規行のinsertより先に行う必要がある(順序が逆だと、挿入した新規行自身の
  // orderIndexもWHERE条件に引っかかり二重にシフトされてしまう)
  test('orderIndexシフトのUPDATE(1本)→新規ルーティンのinsertの順で呼ばれ、名前は「元の名前 コピー」、orderIndexは元の直後になる', async () => {
    const calls: string[] = [];
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日', orderIndex: 2 }]) // source
      .mockResolvedValueOnce([]); // routineExercises
    mockUpdateSet.mockImplementation(() => {
      calls.push('updateShift');
      return { where: (...args: unknown[]) => mockUpdateWhere(...args) };
    });
    mockInsertValues.mockImplementation((table: unknown) => {
      if (table === routines) calls.push('insertRoutine');
      return { returning: () => mockReturning() };
    });

    await duplicateRoutine(1);

    expect(calls).toEqual(['updateShift', 'insertRoutine']);
    expect(mockUpdateSet).toHaveBeenCalledWith(routines, { orderIndex: expect.objectContaining({ type: 'sql' }) });
    expect(mockUpdateWhere).toHaveBeenCalledWith({ type: 'gt', col: routines.orderIndex, val: 2 });
    expect(mockInsertValues).toHaveBeenCalledWith(
      routines,
      expect.objectContaining({ name: '胸の日 コピー', orderIndex: 3 }),
    );
  });

  // 初版は連番なしの単純結合仕様と決めたため(要件定義で合意済み)、コピーをさらに複製すると
  // 「コピー コピー」のように名前が伸びる。これは既知の仕様であることをテストで明示しておく
  test('既に「〇〇 コピー」という名前のルーティンを複製すると「〇〇 コピー コピー」になる(初版は連番なしの仕様)', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日 コピー', orderIndex: 0 }]) // source
      .mockResolvedValueOnce([]); // routineExercises

    await duplicateRoutine(1);

    expect(mockInsertValues).toHaveBeenCalledWith(
      routines,
      expect.objectContaining({ name: '胸の日 コピー コピー' }),
    );
  });

  test('複数種目・複数セットが新しいルーティンIDにひもづけてコピーされる', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日', orderIndex: 0 }]) // source
      .mockResolvedValueOnce([
        { id: 10, exerciseId: 1, orderIndex: 0 },
        { id: 20, exerciseId: 2, orderIndex: 1 },
      ]) // routineExercises
      .mockResolvedValueOnce([
        { id: 100, routineExerciseId: 10, setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
        { id: 200, routineExerciseId: 20, setNumber: 1, weight: 10, reps: 12, durationSeconds: null, distanceMeters: null },
      ]); // routineSets

    mockReturning
      .mockResolvedValueOnce([{ id: 999 }]) // routines insert(複製先)
      .mockResolvedValueOnce([{ id: 500 }]) // 種目1のroutineExercises insert
      .mockResolvedValueOnce([{ id: 600 }]); // 種目2のroutineExercises insert

    const newId = await duplicateRoutine(1);

    expect(newId).toBe(999);
    expect(mockInsertValues).toHaveBeenCalledWith(
      routineExercises,
      expect.objectContaining({ routineId: 999, exerciseId: 1, orderIndex: 0 }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith(
      routineExercises,
      expect.objectContaining({ routineId: 999, exerciseId: 2, orderIndex: 1 }),
    );
    expect(mockInsertValues).toHaveBeenCalledWith(routineSets, [
      expect.objectContaining({ routineExerciseId: 500, setNumber: 1, weight: 60, reps: 8 }),
    ]);
    expect(mockInsertValues).toHaveBeenCalledWith(routineSets, [
      expect.objectContaining({ routineExerciseId: 600, setNumber: 1, weight: 10, reps: 12 }),
    ]);
  });

  test('種目0件のルーティンを複製すると、routineExercises/routineSetsへのinsertは発生しない', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '有酸素', orderIndex: 0 }]) // source
      .mockResolvedValueOnce([]); // routineExercises

    await duplicateRoutine(1);

    expect(mockInsertValues).not.toHaveBeenCalledWith(routineExercises, expect.anything());
    expect(mockInsertValues).not.toHaveBeenCalledWith(routineSets, expect.anything());
  });

  // リマインダーは複製しない(同じ曜日に重複登録されると気づかず放置されがちなため)。
  // reminderPlanを渡さないcreateRoutine同様、紐づくリマインダーの検索すら行わない設計
  test('リマインダーの検索・作成・更新・削除は一切発生しない', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日', orderIndex: 0 }]) // source
      .mockResolvedValueOnce([]); // routineExercises

    await duplicateRoutine(1);

    expect(mockCreateReminder).not.toHaveBeenCalled();
    expect(mockUpdateReminder).not.toHaveBeenCalled();
    expect(mockDeleteReminder).not.toHaveBeenCalled();
    expect(mockSelectWhere).not.toHaveBeenCalledWith(reminders, expect.anything());
  });
});

describe('swapRoutineOrder', () => {
  test('両方存在すればorderIndexが入れ替わる', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ orderIndex: 0 }]).mockResolvedValueOnce([{ orderIndex: 1 }]);

    await swapRoutineOrder(1, 2);

    expect(mockUpdateSet).toHaveBeenCalledWith(routines, { orderIndex: 1 });
    expect(mockUpdateSet).toHaveBeenCalledWith(routines, { orderIndex: 0 });
  });

  test('片方が存在しなければupdateは呼ばれない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ orderIndex: 1 }]);

    await swapRoutineOrder(1, 2);

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  test('両方存在しなければupdateは呼ばれない', async () => {
    mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await swapRoutineOrder(1, 2);

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});

describe('getRoutineDetail', () => {
  test('存在しないroutineIdはnullを返す', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // routines検索

    const result = await getRoutineDetail(999);

    expect(result).toBeNull();
  });

  test('種目0件のルーティンはexercises: []を返す', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '有酸素' }]) // routines
      .mockResolvedValueOnce([]); // routineExercises

    const result = await getRoutineDetail(1);

    expect(result?.exercises).toEqual([]);
  });

  test('セット0件の種目が混ざっていてもその種目のsetsは[]になる', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日' }]) // routines
      .mockResolvedValueOnce([{ id: 10, exerciseId: 1, orderIndex: 0 }]) // routineExercises
      .mockResolvedValueOnce([]); // routineSets

    const result = await getRoutineDetail(1);

    expect(result?.exercises).toEqual([
      expect.objectContaining({ id: 10, sets: [] }),
    ]);
  });

  test('複数種目のセットが混線せず、それぞれのroutineExerciseIdに正しく振り分けられる', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日' }]) // routines
      .mockResolvedValueOnce([
        { id: 10, exerciseId: 1, orderIndex: 0 },
        { id: 20, exerciseId: 2, orderIndex: 1 },
      ]) // routineExercises
      .mockResolvedValueOnce([
        { id: 1, routineExerciseId: 10, setNumber: 1, weight: 60, reps: 8 },
        { id: 2, routineExerciseId: 20, setNumber: 1, weight: 10, reps: 12 },
        { id: 3, routineExerciseId: 10, setNumber: 2, weight: 60, reps: 6 },
      ]); // routineSets(順序が種目間で混ざっている)

    const result = await getRoutineDetail(1);

    const ex10 = result?.exercises.find((e) => e.id === 10);
    const ex20 = result?.exercises.find((e) => e.id === 20);
    expect(ex10?.sets.map((s) => s.id)).toEqual([1, 3]);
    expect(ex20?.sets.map((s) => s.id)).toEqual([2]);
  });

  test('紐づくリマインダーが無ければreminder: nullを返す', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日' }]) // routines
      .mockResolvedValueOnce([]) // routineExercises
      .mockResolvedValueOnce([]); // reminders検索

    const result = await getRoutineDetail(1);

    expect(result?.reminder).toBeNull();
  });

  test('紐づくリマインダーがあればその行を返す', async () => {
    const reminderRow = { id: 42, routineId: 1, title: '胸の日', enabled: true };
    mockSelectWhere
      .mockResolvedValueOnce([{ id: 1, name: '胸の日' }]) // routines
      .mockResolvedValueOnce([]) // routineExercises
      .mockResolvedValueOnce([reminderRow]); // reminders検索

    const result = await getRoutineDetail(1);

    expect(result?.reminder).toEqual(reminderRow);
  });
});

describe('buildInitialRoutineSets', () => {
  test('前回の記録が無ければ空欄1セットにフォールバックする', async () => {
    mockGetPreviousSets.mockResolvedValueOnce([]);

    const result = await buildInitialRoutineSets(1);

    expect(result).toEqual([{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);
  });

  test('前回の記録があればその値をコピーする', async () => {
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: 55, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);

    const result = await buildInitialRoutineSets(1);

    expect(result).toEqual([
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 55, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);
  });

  test('全カラムnullの行(✓未確定のまま終えたセッション由来)は除外される（バグ回帰防止）', async () => {
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { setNumber: 2, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
      { setNumber: 3, weight: 55, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);

    const result = await buildInitialRoutineSets(1);

    expect(result).toEqual([
      { weight: 60, reps: 8, durationSeconds: null, distanceMeters: null },
      { weight: 55, reps: 10, durationSeconds: null, distanceMeters: null },
    ]);
  });

  test('全カラムnullの行しか無ければ結果的に空欄1セットにフォールバックする', async () => {
    mockGetPreviousSets.mockResolvedValueOnce([
      { setNumber: 1, weight: null, reps: null, durationSeconds: null, distanceMeters: null },
    ]);

    const result = await buildInitialRoutineSets(1);

    expect(result).toEqual([{ weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);
  });
});
