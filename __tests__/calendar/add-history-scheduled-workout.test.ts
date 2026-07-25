// lib/calendar/scheduled-workouts.tsのaddHistoryScheduledWorkout（「予定を追加」→「過去の記録」、
// 2026-07-25）専用。この関数だけは「予定枠の作成」と「種目の投入」が別トランザクションに分かれる
// ため、失敗時に予定枠を残さないロールバックを持つ。そこを検証したいので、種目投入側
// (addHistoryCardsToScheduledWorkout)はモックして呼び出し関係だけを見る
// （同モジュールの他の関数の検証はscheduled-workouts.test.tsが担う）
/* eslint-disable no-var */
var mockInsertValues: jest.Mock;
var mockDeleteWhere: jest.Mock;
var mockAddHistoryCards: jest.Mock;

jest.mock('@/db/client', () => {
  mockInsertValues = jest.fn(() => ({ returning: () => Promise.resolve([{ id: 77 }]) }));
  mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  return {
    db: {
      insert: (table: unknown) => ({ values: (values: unknown) => mockInsertValues(table, values) }),
      delete: (table: unknown) => ({ where: (...args: unknown[]) => mockDeleteWhere(table, ...args) }),
    },
  };
});

jest.mock('@/db/schema', () => ({
  scheduledWorkouts: { id: 'scheduledWorkouts.id' },
  scheduledWorkoutExercises: {},
}));

jest.mock('drizzle-orm', () => ({ eq: (...args: unknown[]) => ({ eq: args }) }));

jest.mock('@/lib/calendar/scheduled-workout-detail', () => {
  mockAddHistoryCards = jest.fn().mockResolvedValue(undefined);
  return {
    addHistoryCardsToScheduledWorkout: (...args: unknown[]) => mockAddHistoryCards(...args),
    insertInitialScheduledWorkoutSets: jest.fn(),
    insertRoutineExerciseRowsIntoScheduledWorkout: jest.fn(),
  };
});

jest.mock('@/lib/routines/db', () => ({ getRoutineDetail: jest.fn() }));

import { addHistoryScheduledWorkout } from '@/lib/calendar/scheduled-workouts';

const selections = [
  { exerciseId: 10, sourceWorkoutSessionExerciseId: 500 },
  { exerciseId: 11, sourceWorkoutSessionExerciseId: 501 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAddHistoryCards.mockResolvedValue(undefined);
});

test('ルーティンを介さない直接予定(routineId=null)として作成し、作成したidを返す', async () => {
  const id = await addHistoryScheduledWorkout(selections, '2026-07-25', 19, 30, true);

  expect(id).toBe(77);
  expect(mockInsertValues).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ routineId: null, scheduledDate: '2026-07-25', hour: 19, minute: 30, notifyEnabled: true }),
  );
});

// 種目・目標セットの入れ方は既存の「既存予定へ過去の記録から読み込み」と全く同じ処理を再利用する
test('作成した予定へ、選択したペアをそのままaddHistoryCardsToScheduledWorkoutで投入する', async () => {
  await addHistoryScheduledWorkout(selections, '2026-07-25', 19, 30, true);
  expect(mockAddHistoryCards).toHaveBeenCalledWith(77, selections);
});

test('種目の投入に失敗したら予定枠も削除し、エラーを再throwする（0種目の予定だけが残らない）', async () => {
  mockAddHistoryCards.mockRejectedValueOnce(new Error('fail'));

  await expect(addHistoryScheduledWorkout(selections, '2026-07-25', 19, 30, true)).rejects.toThrow('fail');
  expect(mockDeleteWhere).toHaveBeenCalled();
});

test('選択が0件なら何も作らずthrowする', async () => {
  await expect(addHistoryScheduledWorkout([], '2026-07-25', 19, 30, true)).rejects.toThrow();
  expect(mockInsertValues).not.toHaveBeenCalled();
});

test.each([
  ['時', 24, 0],
  ['分', 19, 60],
])('不正な%sならDBに触れる前にthrowする', async (_label, hour, minute) => {
  await expect(addHistoryScheduledWorkout(selections, '2026-07-25', hour, minute, true)).rejects.toThrow();
  expect(mockInsertValues).not.toHaveBeenCalled();
});
