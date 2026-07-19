// jest.mockはホイストされるため、変数はvarで定義してスコープを合わせる(他のscheduler系テストと同じ方針)
/* eslint-disable no-var */
var mockScheduledWorkoutRows: unknown[];
var mockRoutineRows: unknown[];

const mockAddScheduledWorkout = jest.fn();
const mockDeleteScheduledWorkout = jest.fn();
const mockGetPermissionState = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
// .where()に渡された実引数(eq()の呼び出し結果)を検証できるよう、単なる無視スタブではなく
// 呼び出しを記録するjest.fnにする(自動レビューの指摘: 誤った列を渡す回帰があっても
// このテストが通ってしまう問題への対応)
const mockWhere = jest.fn((..._args: unknown[]) => Promise.resolve(mockScheduledWorkoutRows));

// scheduledWorkouts側は.from(table)を直接await(syncScheduledWorkoutNotifications)する場合と
// .from(table).where(...)をawait(cancelScheduledWorkoutNotificationsForRoutine)する場合の
// 両方があるため、thenableかつ.whereを持つmockChainableオブジェクトを返す(routinesは常に直接await)
function mockChainable(value: unknown) {
  return {
    then: (resolve: (v: unknown) => void) => Promise.resolve(value).then(resolve),
    where: (...args: unknown[]) => mockWhere(...args),
  };
}

// @/db/schemaのモックをここでトップレベルconstとして持つと、babelがconstをvarへ変換する
// 都合でimport起因のrequireがconst代入より先に走り、参照時にundefinedになる(実際に再現確認済み)。
// db.test.tsと同じく、@/db/client側のfactory内でrequire('@/db/schema')して同一インスタンスを
// 遅延取得することで回避する
jest.mock('@/db/client', () => {
  const schema = require('@/db/schema');
  return {
    db: {
      select: jest.fn((cols?: unknown) => ({
        from: (table: unknown) => {
          if (table === schema.scheduledWorkouts) return mockChainable(mockScheduledWorkoutRows);
          if (table === schema.routines) return Promise.resolve(mockRoutineRows);
          throw new Error(`unexpected table: ${JSON.stringify(table)} (cols=${JSON.stringify(cols)})`);
        },
      })),
    },
  };
});

// scheduledWorkoutsは列名を判別できるオブジェクト形にしておく(単なる文字列だと
// scheduledWorkouts.routineIdが常にundefinedになり、.where()に渡る列が正しいかを検証できない)
jest.mock('@/db/schema', () => ({
  scheduledWorkouts: { id: 'scheduledWorkouts.id', routineId: 'scheduledWorkouts.routineId' },
  routines: { id: 'routines.id', name: 'routines.name' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('@/lib/calendar/scheduled-workouts', () => ({
  addScheduledWorkout: (...args: unknown[]) => mockAddScheduledWorkout(...args),
  deleteScheduledWorkout: (...args: unknown[]) => mockDeleteScheduledWorkout(...args),
}));

jest.mock('@/lib/notifications/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
}));

jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
}));

import {
  cancelScheduledWorkoutNotificationsForRoutine,
  createScheduledWorkout,
  removeScheduledWorkout,
  syncScheduledWorkoutNotifications,
} from '@/lib/notifications/scheduled-workout-scheduler';
import { toDateKey } from '@/lib/calendar/date-grid';

function dateKeyOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScheduledWorkoutRows = [];
  mockRoutineRows = [];
  mockAddScheduledWorkout.mockResolvedValue(42);
  mockDeleteScheduledWorkout.mockResolvedValue(undefined);
  mockGetPermissionState.mockResolvedValue('granted');
  mockScheduleNotificationAsync.mockResolvedValue('os-id-1');
  mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createScheduledWorkout', () => {
  it('addScheduledWorkoutで予定を保存し、挿入行のidを返す', async () => {
    const id = await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0);
    expect(mockAddScheduledWorkout).toHaveBeenCalledWith(10, dateKeyOffsetDays(1), 19, 0);
    expect(id).toBe(42);
  });

  it('権限がgrantedかつ未来日時なら、決定論的identifierでDATEトリガーの通知を登録する', async () => {
    await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 30);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [request] = mockScheduleNotificationAsync.mock.calls[0];
    expect(request.identifier).toBe('scheduled-workout-42');
    expect(request.content.title).toBe('胸の日');
    expect(request.content.data).toEqual({
      type: 'scheduled_workout',
      scheduledWorkoutId: 42,
      routineId: 10,
    });
    expect(request.content.channelId).toBe('reminders');
    expect(request.trigger).toEqual({
      type: 'date',
      date: expect.any(Date),
    });
    const fireDate: Date = request.trigger.date;
    expect(fireDate.getHours()).toBe(19);
    expect(fireDate.getMinutes()).toBe(30);
  });

  it('通知本文はリマインダーと同じ定型文(DEFAULT_REMINDER_BODY)を使う', async () => {
    await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0);
    const [request] = mockScheduleNotificationAsync.mock.calls[0];
    expect(request.content.body).toBe('後でじゃなく、今やる。');
  });

  it('権限がdeniedの場合は通知登録をスキップするが、予定自体は保存される', async () => {
    mockGetPermissionState.mockResolvedValue('denied');
    const id = await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0);
    expect(id).toBe(42);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('権限がundeterminedの場合も通知登録をスキップする', async () => {
    mockGetPermissionState.mockResolvedValue('undetermined');
    await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('過去日時の場合は権限があっても通知登録をスキップする', async () => {
    await createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(-1), 19, 0);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('通知登録が失敗しても例外を投げず、予定作成のidはそのまま返す(通知が無くても予定は残す方針)', async () => {
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('schedule failed'));
    await expect(createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0)).resolves.toBe(42);
    expect(mockAddScheduledWorkout).toHaveBeenCalledTimes(1);
  });

  it('addScheduledWorkout自体が失敗した場合は握りつぶさずそのままrejectする(通知登録は行われない)', async () => {
    mockAddScheduledWorkout.mockRejectedValueOnce(new Error('db error'));
    await expect(createScheduledWorkout(10, '胸の日', dateKeyOffsetDays(1), 19, 0)).rejects.toThrow('db error');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('removeScheduledWorkout', () => {
  it('決定論的identifierで通知をキャンセルしてから、DBの予定を削除する', async () => {
    const callOrder: string[] = [];
    mockCancelScheduledNotificationAsync.mockImplementation(async () => {
      callOrder.push('cancel');
    });
    mockDeleteScheduledWorkout.mockImplementation(async () => {
      callOrder.push('delete');
    });

    await removeScheduledWorkout(42);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-workout-42');
    expect(mockDeleteScheduledWorkout).toHaveBeenCalledWith(42);
    expect(callOrder).toEqual(['cancel', 'delete']);
  });

  it('通知キャンセルが失敗しても握りつぶし、DB削除は実行される', async () => {
    mockCancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'));
    await expect(removeScheduledWorkout(42)).resolves.toBeUndefined();
    expect(mockDeleteScheduledWorkout).toHaveBeenCalledWith(42);
  });

  it('DB削除が失敗した場合は握りつぶさずそのままrejectする(呼び出し側のtry/catch+Alertに委ねる契約)', async () => {
    mockDeleteScheduledWorkout.mockRejectedValueOnce(new Error('db error'));
    await expect(removeScheduledWorkout(42)).rejects.toThrow('db error');
  });
});

describe('syncScheduledWorkoutNotifications', () => {
  it('手動予定が0件ならroutinesを引かず、通知登録も行わない', async () => {
    mockScheduledWorkoutRows = [];
    await syncScheduledWorkoutNotifications();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('未来日時の手動予定は再スケジュールされる(冪等な同一identifier)', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10, scheduledDate: dateKeyOffsetDays(2), hour: 8, minute: 0 },
    ];
    mockRoutineRows = [{ id: 10, name: '胸の日' }];

    await syncScheduledWorkoutNotifications();

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [request] = mockScheduleNotificationAsync.mock.calls[0];
    expect(request.identifier).toBe('scheduled-workout-1');
    expect(request.content.title).toBe('胸の日');
  });

  it('過去日時の手動予定は再スケジュールしない', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10, scheduledDate: dateKeyOffsetDays(-3), hour: 8, minute: 0 },
    ];
    mockRoutineRows = [{ id: 10, name: '胸の日' }];

    await syncScheduledWorkoutNotifications();

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('紐づくルーティンが見つからない(削除済み等)場合はスキップする', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 999, scheduledDate: dateKeyOffsetDays(1), hour: 8, minute: 0 },
    ];
    mockRoutineRows = [{ id: 10, name: '胸の日' }];

    await syncScheduledWorkoutNotifications();

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('複数件のうち1件の通知登録が失敗しても、残りの処理は続行される', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10, scheduledDate: dateKeyOffsetDays(1), hour: 8, minute: 0 },
      { id: 2, routineId: 11, scheduledDate: dateKeyOffsetDays(1), hour: 9, minute: 0 },
    ];
    mockRoutineRows = [
      { id: 10, name: '胸の日' },
      { id: 11, name: '脚の日' },
    ];
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('fail once'));

    await syncScheduledWorkoutNotifications();

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('権限がgranted以外の場合は何もスケジュールしない', async () => {
    mockGetPermissionState.mockResolvedValue('denied');
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10, scheduledDate: dateKeyOffsetDays(1), hour: 8, minute: 0 },
    ];
    mockRoutineRows = [{ id: 10, name: '胸の日' }];

    await syncScheduledWorkoutNotifications();

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('権限チェックは1回だけ行う(予定が複数件あっても行ごとにネイティブ呼び出しを繰り返さない)', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10, scheduledDate: dateKeyOffsetDays(1), hour: 8, minute: 0 },
      { id: 2, routineId: 11, scheduledDate: dateKeyOffsetDays(1), hour: 9, minute: 0 },
    ];
    mockRoutineRows = [
      { id: 10, name: '胸の日' },
      { id: 11, name: '脚の日' },
    ];

    await syncScheduledWorkoutNotifications();

    expect(mockGetPermissionState).toHaveBeenCalledTimes(1);
  });
});

describe('cancelScheduledWorkoutNotificationsForRoutine', () => {
  it('routineIdに紐づく手動予定それぞれの通知をキャンセルする(DBのscheduledWorkouts行には触れない)', async () => {
    mockScheduledWorkoutRows = [
      { id: 1, routineId: 10 },
      { id: 2, routineId: 10 },
    ];

    await cancelScheduledWorkoutNotificationsForRoutine(10);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-workout-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-workout-2');
    expect(mockDeleteScheduledWorkout).not.toHaveBeenCalled();
    // routineIdではなくidを条件に絞り込むような列違いの回帰を検知できるよう、.where()に渡った
    // 実引数(eq(scheduledWorkouts.routineId, routineId)の戻り値)を検証する(自動レビュー指摘対応)
    expect(mockWhere).toHaveBeenCalledWith({ col: 'scheduledWorkouts.routineId', val: 10 });
  });

  it('紐づく手動予定が無ければ何もキャンセルしない', async () => {
    mockScheduledWorkoutRows = [];
    await cancelScheduledWorkoutNotificationsForRoutine(10);
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('個々のキャンセルが失敗しても握りつぶす(呼び出し元のdeleteRoutineを止めない)', async () => {
    mockScheduledWorkoutRows = [{ id: 1, routineId: 10 }];
    mockCancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'));
    await expect(cancelScheduledWorkoutNotificationsForRoutine(10)).resolves.toBeUndefined();
  });
});

describe('同日境界(今日の中で時刻だけが過去/未来)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 19, 12, 0, 0));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('今日の予定でも、指定時刻が現在時刻より未来なら通知登録される', async () => {
    await createScheduledWorkout(10, '胸の日', toDateKey(new Date(2026, 6, 19)), 20, 0);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('今日の予定で、指定時刻が既に現在時刻より過去なら通知登録されない', async () => {
    await createScheduledWorkout(10, '胸の日', toDateKey(new Date(2026, 6, 19)), 9, 0);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ちょうど現在時刻と一致する場合はスキップされる(<=境界)', async () => {
    await createScheduledWorkout(10, '胸の日', toDateKey(new Date(2026, 6, 19)), 12, 0);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
