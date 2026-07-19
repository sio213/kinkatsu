// jest.mockはホイストされるため、変数はvarで定義してスコープを合わせる(他のscheduler系テストと同じ方針)
/* eslint-disable no-var */
var mockReminderRows: unknown[];
var mockNotificationRows: unknown[];

const mockAddReminderScheduleSkip = jest.fn();
const mockRemoveReminderScheduleSkip = jest.fn();
const mockHasReminderScheduleSkip = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockDeleteWhere = jest.fn();
const mockInsertValues = jest.fn();
// select().from(reminderNotifications).where(condition)の実引数(and(gte(...), lt(...))相当)を
// 捕捉する。dayBoundsが計算した実際のepoch値がどこにも検証されていなかった問題への対応
// (@reviewer Major指摘#8: 日境界のバグ(月/年またぎ・うるう年等)が検出できない)
const mockSelectWhere = jest.fn();

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(() => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          mockSelectWhere(table, condition);
          if (table === 'reminders') return Promise.resolve(mockReminderRows);
          if (table === 'reminderNotifications') return Promise.resolve(mockNotificationRows);
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    })),
    delete: jest.fn((table: unknown) => ({
      where: (...args: unknown[]) => mockDeleteWhere(table, ...args),
    })),
    insert: jest.fn((table: unknown) => ({
      values: (...args: unknown[]) => mockInsertValues(table, ...args),
    })),
  },
}));

jest.mock('@/db/schema', () => ({
  reminders: 'reminders',
  reminderNotifications: 'reminderNotifications',
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conds) => ({ conds })),
  eq: jest.fn((col, val) => ({ col, val, op: 'eq' })),
  gte: jest.fn((col, val) => ({ col, val, op: 'gte' })),
  lt: jest.fn((col, val) => ({ col, val, op: 'lt' })),
}));

jest.mock('@/lib/calendar/reminder-skips', () => ({
  addReminderScheduleSkip: (...args: unknown[]) => mockAddReminderScheduleSkip(...args),
  removeReminderScheduleSkip: (...args: unknown[]) => mockRemoveReminderScheduleSkip(...args),
  hasReminderScheduleSkip: (...args: unknown[]) => mockHasReminderScheduleSkip(...args),
}));

jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
}));

import { skipReminderOccurrence, unskipReminderOccurrence } from '@/lib/notifications/reminder-skip-scheduler';
import { parseDateKey, toDateKey } from '@/lib/calendar/date-grid';

const BASE_REMINDER = {
  title: '胸の日',
  body: '後でじゃなく、今やる。',
  weekdays: null,
  monthdays: null,
  anchorDate: null,
  intervalDays: null,
  intervalMonths: null,
  nthWeek: null,
  nthWeekdays: null,
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
};

// 隔週(weekly, intervalDays=14) = キュー方式。単純な毎週(intervalDays=7 or未設定) = ネイティブ方式
function queueReminder(overrides: Record<string, unknown> = {}) {
  return { ...BASE_REMINDER, id: 1, routineId: 10, kind: 'weekly', intervalDays: 14, hour: 7, minute: 0, ...overrides };
}
function nativeReminder(overrides: Record<string, unknown> = {}) {
  return { ...BASE_REMINDER, id: 1, routineId: 10, kind: 'weekly', intervalDays: 7, hour: 7, minute: 0, ...overrides };
}

function futureDateKeyOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

// dayBounds(dateKey)の期待値を、ソースと同じsetDate(+1)方式で独立に計算する(実装のコピーではなく
// 「1日分の範囲になっているか」を素朴に検証するための土台)
function expectedDayBounds(dateKey: string): { start: number; end: number } {
  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function lastReminderNotificationsWhereCondition(): { conds: { col: string; val: number; op: string }[] } {
  const call = mockSelectWhere.mock.calls.filter(([table]) => table === 'reminderNotifications').pop();
  if (!call) throw new Error('reminderNotifications への select where 呼び出しが見つかりません');
  return call[1] as { conds: { col: string; val: number; op: string }[] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReminderRows = [];
  mockNotificationRows = [];
  mockAddReminderScheduleSkip.mockResolvedValue(1);
  mockRemoveReminderScheduleSkip.mockResolvedValue(undefined);
  mockHasReminderScheduleSkip.mockResolvedValue(false);
  mockScheduleNotificationAsync.mockResolvedValue('os-id-1');
  mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockDeleteWhere.mockResolvedValue(undefined);
  mockInsertValues.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('skipReminderOccurrence', () => {
  it('スキップ記録を保存する', async () => {
    mockReminderRows = [];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockAddReminderScheduleSkip).toHaveBeenCalledWith(1, '2026-07-27');
  });

  it('既にスキップ済みの日への二重呼び出しは、addReminderScheduleSkip自体を呼ばず冪等に成功する(⋮メニュー連打等でのunique制約違反エラーを防ぐ、@reviewer/@tester指摘対応)', async () => {
    mockHasReminderScheduleSkip.mockResolvedValue(true);
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toEqual({ notificationSuppressed: true });
    expect(mockAddReminderScheduleSkip).not.toHaveBeenCalled();
  });

  it('addReminderScheduleSkipがUNIQUE制約違反で失敗しても(TOCTOU: 存在チェック直後に別経路で挿入された場合)、既にスキップ済みとして扱い成功する(@reviewer Suggestion指摘#5)', async () => {
    mockAddReminderScheduleSkip.mockRejectedValueOnce(new Error('UNIQUE constraint failed: reminder_schedule_skips.reminder_id, reminder_schedule_skips.skipped_date'));
    mockReminderRows = [];
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toEqual({ notificationSuppressed: true });
  });

  it('キュー方式かつ該当日に予約済みの通知があれば、その1件をキャンセル+DB削除する', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toEqual({ notificationSuppressed: true });
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-abc');
    expect(mockDeleteWhere).toHaveBeenCalledWith('reminderNotifications', expect.anything());
  });

  it('該当日の範囲判定(gte/lt)が実際にその1日分の開始・終了epochになっている(@reviewer Major指摘#8: 日境界の未検証を解消)', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [];
    const dateKey = '2026-07-27';
    await skipReminderOccurrence(1, dateKey);

    const { conds } = lastReminderNotificationsWhereCondition();
    const gteCond = conds.find((c) => c.op === 'gte')!;
    const ltCond = conds.find((c) => c.op === 'lt')!;
    const { start, end } = expectedDayBounds(dateKey);
    expect(gteCond.val).toBe(start);
    expect(ltCond.val).toBe(end);
    expect(ltCond.val - gteCond.val).toBe(24 * 60 * 60 * 1000);
  });

  it('該当日の範囲判定は年またぎでも正しく1日分になる(@reviewer Major指摘#8)', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [];
    const dateKey = '2026-12-31';
    await skipReminderOccurrence(1, dateKey);

    const { conds } = lastReminderNotificationsWhereCondition();
    const gteCond = conds.find((c) => c.op === 'gte')!;
    const ltCond = conds.find((c) => c.op === 'lt')!;
    const { start, end } = expectedDayBounds(dateKey);
    expect(gteCond.val).toBe(start);
    expect(ltCond.val).toBe(end);
  });

  it('該当日に予約済みの通知が無ければ、キャンセル/削除は何も行わない', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('ネイティブ方式(毎週等)の場合、通知の予約有無に関わらずキャンセルせず、notificationSuppressed: falseを返す(PR10-6aの既知の制約。呼び出し元はこれを見てユーザーに一言伝える)', async () => {
    mockReminderRows = [nativeReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toEqual({ notificationSuppressed: false });
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('リマインダーが見つからない場合(削除済み等)は通知処理をスキップするが、スキップ記録自体は保存される', async () => {
    mockReminderRows = [];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockAddReminderScheduleSkip).toHaveBeenCalledWith(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('通知キャンセル処理が例外を投げても、握りつぶしてrejectせずnotificationSuppressed: falseを返す', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    mockDeleteWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toEqual({ notificationSuppressed: false });
  });

  it('スキップ記録の保存自体が失敗した場合(UNIQUE制約違反以外)は握りつぶさずそのままrejectする', async () => {
    mockAddReminderScheduleSkip.mockRejectedValueOnce(new Error('db error'));
    await expect(skipReminderOccurrence(1, '2026-07-27')).rejects.toThrow('db error');
  });

  it('reminderIdが既にcascade削除済みの場合(FOREIGN KEY constraint failed)も、UNIQUE制約と同様に握りつぶさずそのままrejectする(@tester指摘: ルーティン削除直後にゴーストカードが残ったまま⋮操作される競合を想定)', async () => {
    mockAddReminderScheduleSkip.mockRejectedValueOnce(new Error('FOREIGN KEY constraint failed'));
    await expect(skipReminderOccurrence(1, '2026-07-27')).rejects.toThrow('FOREIGN KEY constraint failed');
  });

  it('同一reminderId+日付への同時呼び出し(TOCTOU再現: どちらもhasReminderScheduleSkip=falseで存在チェックをすり抜けた後、片方だけがinsertに先勝ちしもう片方がUNIQUE制約違反になる)を、実際にPromise.allで並行実行しても両方成功として解決する(@reviewer Major指摘: 逐次呼び出しのテストしか無くTOCTOU対策の実効性が並行実行で検証されていなかった)', async () => {
    mockHasReminderScheduleSkip.mockResolvedValue(false);
    mockAddReminderScheduleSkip
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(
        new Error(
          'UNIQUE constraint failed: reminder_schedule_skips.reminder_id, reminder_schedule_skips.skipped_date',
        ),
      );
    mockReminderRows = [];

    const results = await Promise.all([
      skipReminderOccurrence(1, '2026-07-27'),
      skipReminderOccurrence(1, '2026-07-27'),
    ]);

    expect(results).toEqual([{ notificationSuppressed: true }, { notificationSuppressed: true }]);
    expect(mockAddReminderScheduleSkip).toHaveBeenCalledTimes(2);
  });
});

describe('unskipReminderOccurrence', () => {
  it('スキップ記録を削除する', async () => {
    mockReminderRows = [];
    await unskipReminderOccurrence(1, futureDateKeyOffsetDays(7));
    expect(mockRemoveReminderScheduleSkip).toHaveBeenCalledWith(1, futureDateKeyOffsetDays(7));
  });

  it('キュー方式かつ未来日であれば、その1件を単発DATEトリガーで再登録する', async () => {
    mockReminderRows = [queueReminder()];
    const dateKey = futureDateKeyOffsetDays(7);
    await unskipReminderOccurrence(1, dateKey);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [request] = mockScheduleNotificationAsync.mock.calls[0];
    expect(request.content.title).toBe('胸の日');
    expect(request.content.data).toEqual({ type: 'reminder', reminderId: 1 });
    expect(request.trigger.type).toBe('date');
    expect(request.trigger.date.getHours()).toBe(7);
    expect(request.trigger.date.getMinutes()).toBe(0);

    expect(mockInsertValues).toHaveBeenCalledWith(
      'reminderNotifications',
      expect.objectContaining({ reminderId: 1, osNotificationId: 'os-id-1', triggerType: 'queue' }),
    );
  });

  it('再登録前に、その日に残っている古いreminderNotifications行(先行するキャンセルが途中失敗して残った物等)を先に掃除してから作り直す(@reviewer Minor指摘#4: 通知の二重登録防止)', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [{ id: 9, osNotificationId: 'os-stale', reminderId: 1, fireAt: 123 }];
    const dateKey = futureDateKeyOffsetDays(7);
    await unskipReminderOccurrence(1, dateKey);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-stale');
    expect(mockDeleteWhere).toHaveBeenCalledWith('reminderNotifications', expect.anything());
    // 掃除の後、新しい1件が改めて登録される
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
  });

  it('過去日であれば通知は再登録しない', async () => {
    mockReminderRows = [queueReminder()];
    await unskipReminderOccurrence(1, '2020-01-01');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ネイティブ方式の場合は通知を再登録しない(元々個別キャンセルしていないため)', async () => {
    mockReminderRows = [nativeReminder()];
    await unskipReminderOccurrence(1, futureDateKeyOffsetDays(7));
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('リマインダーが無効化されている場合は通知を再登録しない', async () => {
    mockReminderRows = [queueReminder({ enabled: false })];
    await unskipReminderOccurrence(1, futureDateKeyOffsetDays(7));
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('リマインダーが見つからない場合は通知を再登録しない', async () => {
    mockReminderRows = [];
    await unskipReminderOccurrence(1, futureDateKeyOffsetDays(7));
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('通知の再登録が失敗しても、握りつぶしてrejectしない', async () => {
    mockReminderRows = [queueReminder()];
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('schedule failed'));
    await expect(unskipReminderOccurrence(1, futureDateKeyOffsetDays(7))).resolves.toBeUndefined();
  });

  it('スキップ記録の削除自体が失敗した場合は握りつぶさずそのままrejectする', async () => {
    mockRemoveReminderScheduleSkip.mockRejectedValueOnce(new Error('db error'));
    await expect(unskipReminderOccurrence(1, futureDateKeyOffsetDays(7))).rejects.toThrow('db error');
  });
});
