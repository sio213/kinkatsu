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

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(() => ({
      from: (table: unknown) => ({
        where: () => {
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
  eq: jest.fn((col, val) => ({ col, val })),
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
import { toDateKey } from '@/lib/calendar/date-grid';

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
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toBeUndefined();
    expect(mockAddReminderScheduleSkip).not.toHaveBeenCalled();
  });

  it('キュー方式かつ該当日に予約済みの通知があれば、その1件をキャンセル+DB削除する', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-abc');
    expect(mockDeleteWhere).toHaveBeenCalledWith('reminderNotifications', expect.anything());
  });

  it('該当日に予約済みの通知が無ければ、キャンセル/削除は何も行わない', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('ネイティブ方式(毎週等)の場合、通知の予約有無に関わらずキャンセルしない(PR10-6aの既知の制約)', async () => {
    mockReminderRows = [nativeReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('リマインダーが見つからない場合(削除済み等)は通知処理をスキップするが、スキップ記録自体は保存される', async () => {
    mockReminderRows = [];
    await skipReminderOccurrence(1, '2026-07-27');
    expect(mockAddReminderScheduleSkip).toHaveBeenCalledWith(1, '2026-07-27');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('通知キャンセル処理が例外を投げても、握りつぶしてrejectしない', async () => {
    mockReminderRows = [queueReminder()];
    mockNotificationRows = [{ id: 5, osNotificationId: 'os-abc', reminderId: 1, fireAt: 123 }];
    mockDeleteWhere.mockRejectedValueOnce(new Error('db error'));
    await expect(skipReminderOccurrence(1, '2026-07-27')).resolves.toBeUndefined();
  });

  it('スキップ記録の保存自体が失敗した場合は握りつぶさずそのままrejectする', async () => {
    mockAddReminderScheduleSkip.mockRejectedValueOnce(new Error('db error'));
    await expect(skipReminderOccurrence(1, '2026-07-27')).rejects.toThrow('db error');
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
