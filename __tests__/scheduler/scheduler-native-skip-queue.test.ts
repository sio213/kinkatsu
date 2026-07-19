// PR10-6c: ネイティブ方式(毎日/毎週/単純な毎月)リマインダーを、未来のスキップが1件でも
// 残っている間だけ一時的にキュー方式へ切り替え、スキップ日経過後は自動でネイティブへ戻す機能を
// 検証する。call-order前提の薄いモックだと状態遷移(native⇄queue往復)を正しく検証できないため、
// ここではreminders/reminderNotifications/reminderScheduleSkipsをそれぞれ実配列として持つ
// 簡易インメモリDBを組み、drizzle-orm(and/eq/gt/gte/lt/lte)の各条件を実際に評価する。
// jest.mockのファクトリはスコープ外の変数/関数を参照できない("mock"接頭辞のみ許可)ため、
// 状態・ヘルパーは全て"mock"接頭辞のvar/関数として定義する
/* eslint-disable no-var */
var mockRemindersTable: Record<string, unknown>[];
var mockNotificationsTable: Record<string, unknown>[];
var mockSkipsTable: Record<string, unknown>[];
var mockNextNotificationId: number;

const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();

type MockCond =
  | { type: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; col: string; val: unknown }
  | { type: 'and'; conds: MockCond[] }
  | undefined;

function mockConditionMatches(row: Record<string, unknown>, cond: MockCond): boolean {
  if (!cond) return true;
  if (cond.type === 'and') return cond.conds.every((c) => mockConditionMatches(row, c));
  const v = row[cond.col];
  switch (cond.type) {
    case 'eq':
      return v === cond.val;
    case 'gt':
      return (v as number) > (cond.val as number);
    case 'gte':
      return (v as number) >= (cond.val as number);
    case 'lt':
      return (v as number) < (cond.val as number);
    case 'lte':
      return (v as number) <= (cond.val as number);
  }
}

// tableは@/db/schemaモックのオブジェクトそのものが渡ってくる。__tableプロパティで識別する
// (jest.mock同士は別ファクトリなのでオブジェクト参照を共有できないため)
function mockTableFor(table: unknown): Record<string, unknown>[] {
  const name = (table as { __table?: string } | undefined)?.__table;
  if (name === 'reminders') return mockRemindersTable;
  if (name === 'reminderNotifications') return mockNotificationsTable;
  if (name === 'reminderScheduleSkips') return mockSkipsTable;
  throw new Error(`unexpected table marker: ${JSON.stringify(table)}`);
}

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn((projection?: Record<string, string>) => ({
      from: (table: unknown) => {
        const project = (row: Record<string, unknown>) =>
          projection ? Object.fromEntries(Object.entries(projection).map(([k, col]) => [k, row[col as string]])) : row;
        const resolve = (cond: MockCond) =>
          Promise.resolve(mockTableFor(table).filter((r) => mockConditionMatches(r, cond)).map(project));
        return {
          where: (cond: MockCond) => resolve(cond),
          then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
            resolve(undefined).then(onFulfilled, onRejected),
        };
      },
    })),
    insert: jest.fn((table: unknown) => ({
      values: (rowOrRows: unknown) => {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const target = mockTableFor(table);
        for (const r of rows) target.push({ id: mockNextNotificationId++, ...(r as object) });
        return Promise.resolve(undefined);
      },
    })),
    delete: jest.fn((table: unknown) => ({
      where: (cond: MockCond) => {
        const target = mockTableFor(table);
        const remaining = target.filter((r) => !mockConditionMatches(r, cond));
        target.length = 0;
        target.push(...remaining);
        return Promise.resolve(undefined);
      },
    })),
    // updateReminder/setReminderEnabled(scheduler.ts)向け。マッチした行にObject.assignで
    // 上書きする単純な実装(部分更新のみ、実際のdrizzleのset()と同じセマンティクス)
    update: jest.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (cond: MockCond) => {
          const target = mockTableFor(table);
          for (const row of target) {
            if (mockConditionMatches(row, cond)) Object.assign(row, values);
          }
          return Promise.resolve(undefined);
        },
      }),
    })),
  },
}));

jest.mock('@/db/schema', () => ({
  reminders: { __table: 'reminders', id: 'id', enabled: 'enabled' },
  reminderNotifications: {
    __table: 'reminderNotifications',
    reminderId: 'reminderId',
    fireAt: 'fireAt',
    triggerType: 'triggerType',
  },
  reminderScheduleSkips: {
    __table: 'reminderScheduleSkips',
    reminderId: 'reminderId',
    skippedDate: 'skippedDate',
  },
}));

jest.mock('drizzle-orm', () => ({
  and: (...conds: MockCond[]) => ({ type: 'and', conds }),
  eq: (col: string, val: unknown) => ({ type: 'eq', col, val }),
  gt: (col: string, val: unknown) => ({ type: 'gt', col, val }),
  gte: (col: string, val: unknown) => ({ type: 'gte', col, val }),
  lt: (col: string, val: unknown) => ({ type: 'lt', col, val }),
  lte: (col: string, val: unknown) => ({ type: 'lte', col, val }),
}));

jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
}));

import {
  deleteReminder,
  parseReminder,
  reconcileNativeReminderSchedules,
  refillAllReminders,
  refillReminder,
  rescheduleReminderFromDb,
  resolveEffectiveTriggerType,
  setReminderEnabled,
  updateReminder,
} from '@/lib/notifications/scheduler';
import { toDateKey } from '@/lib/calendar/date-grid';
import type { ReminderInput } from '@/lib/notifications/types';

// 起点: 2026-07-20(月) 00:00。次の日曜(第1候補)は2026-07-26
const NOW = new Date(2026, 6, 20, 0, 0, 0);
const ANCHOR = new Date(2026, 5, 7, 7, 0, 0).getTime(); // 2026-06-07(日) 07:00

// 単純な毎週日曜(base='native')
function nativeWeeklyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    routineId: null,
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'weekly',
    hour: 7,
    minute: 0,
    weekdays: '[0]',
    monthdays: null,
    anchorDate: ANCHOR,
    intervalDays: 7,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// 隔週(base='queue'、常にqueueのまま)
function queueBiweeklyRow(overrides: Record<string, unknown> = {}) {
  return { ...nativeWeeklyRow({ id: 2, intervalDays: 14 }), ...overrides };
}

// 毎日(interval, intervalDays=1、base='native')。一時キュー化された際にcomputeDailyFireDates
// (schedule-math.ts、PR10-6c新設)を実際に通る経路の検証に使う
function nativeDailyRow(overrides: Record<string, unknown> = {}) {
  return {
    ...nativeWeeklyRow({ kind: 'interval', intervalDays: 1, weekdays: null, anchorDate: null }),
    ...overrides,
  };
}

function nativeNotificationRow(reminderId: number, osNotificationId: string) {
  return { id: mockNextNotificationId++, reminderId, osNotificationId, triggerType: 'native', fireAt: null, createdAt: 0 };
}

function queueNotificationRow(reminderId: number, osNotificationId: string, fireAt: number) {
  return { id: mockNextNotificationId++, reminderId, osNotificationId, triggerType: 'queue', fireAt, createdAt: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
  mockRemindersTable = [];
  mockNotificationsTable = [];
  mockSkipsTable = [];
  mockNextNotificationId = 100;
  mockScheduleNotificationAsync.mockImplementation(() => Promise.resolve(`os-${mockNextNotificationId}`));
  mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('resolveEffectiveTriggerType', () => {
  it('base native かつ スキップ無し → native', async () => {
    const r = parseReminder(nativeWeeklyRow() as never);
    mockSkipsTable = [];
    await expect(resolveEffectiveTriggerType(r)).resolves.toBe('native');
  });

  it('base native かつ 未来のスキップが1件でもある → queue', async () => {
    const r = parseReminder(nativeWeeklyRow() as never);
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];
    await expect(resolveEffectiveTriggerType(r)).resolves.toBe('queue');
  });

  it('base queue は常にqueue(スキップの有無を見ない)', async () => {
    const r = parseReminder(queueBiweeklyRow() as never);
    mockSkipsTable = [];
    await expect(resolveEffectiveTriggerType(r)).resolves.toBe('queue');
  });
});

describe('rescheduleReminderFromDb (ネイティブ⇄一時キューの往復)', () => {
  it('ネイティブ方式+スキップ有り: 既存のnative通知を全キャンセルし、スキップ日を除外したqueue通知を作り直す', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1'), nativeNotificationRow(1, 'os-native-2')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }]; // 次の日曜

    await rescheduleReminderFromDb(1);

    // 既存のnative通知はキャンセル済み
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-2');

    // 作り直された行は全てqueue方式
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);

    // スキップした日(2026-07-26)は生成された発火日に含まれない
    const fireDateKeys = rows.map((r) => toDateKey(new Date(r.fireAt as number)));
    expect(fireDateKeys).not.toContain('2026-07-26');
  });

  it('毎日(interval, intervalDays=1)のnative+スキップ有りも一時キュー化され、computeDailyFireDatesで連続日程が生成される(@tester指摘: 実際の一時キュー化フローを通したcomputeDailyFireDatesの検証が無かった)', async () => {
    mockRemindersTable = [nativeDailyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-daily-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-22' }];

    await rescheduleReminderFromDb(1);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-daily-1');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);

    const fireDateKeys = rows.map((r) => toDateKey(new Date(r.fireAt as number))).sort();
    expect(fireDateKeys).not.toContain('2026-07-22');
    // 連続した日程になっている(前後の日付との差が全て1日)ことを確認
    for (let i = 1; i < fireDateKeys.length; i++) {
      const prev = new Date(fireDateKeys[i - 1]).getTime();
      const cur = new Date(fireDateKeys[i]).getTime();
      expect(cur - prev).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000); // スキップ日をまたぐ箇所は2日差になる
    }
  });

  it('ネイティブ方式+スキップ無し(元々native): 既にnativeのままなら再構築されてもnative通知として作り直される', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [];

    await rescheduleReminderFromDb(1);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'native')).toBe(true);
  });

  it('一時キュー化されていた後にスキップが全て解消された場合、queue通知をキャンセルしnativeへ復帰する', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [
      queueNotificationRow(1, 'os-queue-1', new Date(2026, 6, 26, 7, 0).getTime()),
      queueNotificationRow(1, 'os-queue-2', new Date(2026, 7, 2, 7, 0).getTime()),
    ];
    mockSkipsTable = []; // スキップは全て解消済み

    await rescheduleReminderFromDb(1);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-queue-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-queue-2');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'native')).toBe(true);
  });

  it('無効化(enabled=false)されているリマインダーは、キャンセルのみ行い再スケジュールしない', async () => {
    mockRemindersTable = [nativeWeeklyRow({ enabled: false })];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await rescheduleReminderFromDb(1);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    expect(mockNotificationsTable.filter((r) => r.reminderId === 1)).toEqual([]);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('リマインダーが見つからない場合(削除済み)は何もせず終了する', async () => {
    mockRemindersTable = [];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    await expect(rescheduleReminderFromDb(1)).resolves.toBeUndefined();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('reconcileNativeReminderSchedules (起動時の整合)', () => {
  it('スキップが残っているのにnative行のまま(未変換/後方互換)のリマインダーはqueue化される', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1 })];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);
  });

  it('スキップが無いのにqueue行が残っている(スキップ日経過後の取り残し)リマインダーはnativeへ復帰する', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1 })];
    mockNotificationsTable = [queueNotificationRow(1, 'os-queue-1', new Date(2026, 6, 26, 7, 0).getTime())];
    mockSkipsTable = []; // pruneExpiredReminderScheduleSkipsで既に消えている想定

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-queue-1');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.every((r) => r.triggerType === 'native')).toBe(true);
  });

  it('整合済み(スキップ無し+native行のまま)のリマインダーには一切触れない', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1 })];
    const before = [nativeNotificationRow(1, 'os-native-1')];
    mockNotificationsTable = [...before];
    mockSkipsTable = [];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotificationsTable).toEqual(before);
  });

  it('整合済み(スキップ有り+既にqueue化済み)のリマインダーには一切触れない', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1 })];
    mockNotificationsTable = [queueNotificationRow(1, 'os-queue-1', new Date(2026, 6, 26, 7, 0).getTime())];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('base=queueのリマインダー(隔週等)は、スキップの有無に関わらず対象外(常にqueueのままなので触れる必要が無い)', async () => {
    mockRemindersTable = [queueBiweeklyRow({ id: 2 })];
    mockNotificationsTable = [nativeNotificationRow(2, 'os-should-not-exist')]; // 本来あり得ない状態だが、念のため触れないことを確認
    mockSkipsTable = [];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('無効化されているリマインダーは対象外', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1, enabled: false })];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('複数リマインダーが混在していても、それぞれ独立して正しく整合される', async () => {
    mockRemindersTable = [nativeWeeklyRow({ id: 1 }), nativeWeeklyRow({ id: 3, title: '背中の日' })];
    mockNotificationsTable = [
      nativeNotificationRow(1, 'os-1-native'), // id1: スキップ有りなのでqueue化されるべき
      queueNotificationRow(3, 'os-3-queue', new Date(2026, 6, 26, 7, 0).getTime()), // id3: スキップ無しなのでnative復帰すべき
    ];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await reconcileNativeReminderSchedules();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-1-native');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-3-queue');
    expect(mockNotificationsTable.filter((r) => r.reminderId === 1).every((r) => r.triggerType === 'queue')).toBe(true);
    expect(mockNotificationsTable.filter((r) => r.reminderId === 3).every((r) => r.triggerType === 'native')).toBe(true);
  });
});

describe('updateReminder/setReminderEnabled/deleteReminder × 一時キュー中native(往復堅牢性、@tester指摘)', () => {
  // nativeWeeklyRowと同じ設定のReminderInput(ReminderInputはweekdaysを配列で持つ点がDB行と異なる)
  function nativeWeeklyInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
    return {
      title: '胸の日',
      body: '後でじゃなく、今やる。',
      kind: 'weekly',
      hour: 7,
      minute: 0,
      weekdays: [0],
      anchorDate: ANCHOR,
      intervalDays: 7,
      enabled: true,
      ...overrides,
    };
  }

  it('updateReminder: 未来のスキップが残ったまま編集しても、再構築後もキュー方式でスキップ日は除外され続ける', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await updateReminder(1, nativeWeeklyInput({ hour: 8 })); // 時刻だけ変更

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);
    const fireDateKeys = rows.map((r) => toDateKey(new Date(r.fireAt as number)));
    expect(fireDateKeys).not.toContain('2026-07-26');
  });

  it('updateReminder: スキップが無い状態で編集すれば、通常通りnativeのまま再構築される', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [];

    await updateReminder(1, nativeWeeklyInput({ hour: 8 }));

    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'native')).toBe(true);
  });

  it('setReminderEnabled: 無効化→有効化で、未来のスキップが未解消ならqueueとして復元される', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await setReminderEnabled(1, false);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-native-1');
    expect(mockNotificationsTable.filter((r) => r.reminderId === 1)).toEqual([]);
    expect(mockRemindersTable.find((r) => r.id === 1)?.enabled).toBe(false);

    await setReminderEnabled(1, true);
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);
  });

  it('setReminderEnabled: 無効化→有効化で、スキップが解消済みならnativeとして復元される', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [nativeNotificationRow(1, 'os-native-1')];
    mockSkipsTable = [];

    await setReminderEnabled(1, false);
    await setReminderEnabled(1, true);

    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.triggerType === 'native')).toBe(true);
  });

  it('deleteReminder: 一時キュー化(queue)されていたreminderNotifications行もOSキャンセル+DB削除される', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockNotificationsTable = [
      queueNotificationRow(1, 'os-queue-1', new Date(2026, 6, 26, 7, 0).getTime()),
      queueNotificationRow(1, 'os-queue-2', new Date(2026, 7, 2, 7, 0).getTime()),
    ];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await deleteReminder(1);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-queue-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('os-queue-2');
    expect(mockNotificationsTable.filter((r) => r.reminderId === 1)).toEqual([]);
    expect(mockRemindersTable.find((r) => r.id === 1)).toBeUndefined();
  });
});

describe('refillAllReminders: 一時キュー化されたnativeがquota計算の分母に入る効果(@tester指摘)', () => {
  // base-queue(interval, intervalDays=7)の「他の」リマインダーを複数用意し、一時キュー化された
  // native(reminderId=1)が分母に含まれるかどうかでcomputeQuotaPerReminderの結果が変わり、
  // 実際にscheduleNotificationAsyncの呼び出し件数(=depth)が変化することを検証する
  function otherQueueReminderRow(id: number) {
    return nativeWeeklyRow({ id, kind: 'interval', intervalDays: 7, weekdays: null });
  }

  function scheduledCountFor(reminderId: number): number {
    return mockScheduleNotificationAsync.mock.calls.filter(
      ([req]) => (req as { content: { data: { reminderId: number } } }).content.data.reminderId === reminderId,
    ).length;
  }

  it('一時キュー化されたnativeが居ない場合、他の5件のqueueリマインダーはquota=12(60/5)ずつ配分される', async () => {
    mockRemindersTable = [
      nativeWeeklyRow({ id: 1 }), // スキップ無し→native扱いのまま、quota計算に含まれない
      ...[10, 11, 12, 13, 14].map(otherQueueReminderRow),
    ];
    mockSkipsTable = [];

    await refillAllReminders(NOW);

    // QUEUE_DEPTH_INTERVAL(14) > quota(12)のためquotaで頭打ちになる
    for (const id of [10, 11, 12, 13, 14]) {
      expect(scheduledCountFor(id)).toBe(12);
    }
    expect(scheduledCountFor(1)).toBe(0); // nativeのまま補充対象外
  });

  it('一時キュー化されたnativeが居る場合、分母が6になりquota=10(60/6)へ下がって他のリマインダーへの配分も減る', async () => {
    mockRemindersTable = [
      nativeWeeklyRow({ id: 1 }), // スキップ有り→一時キュー化されquota計算に加算される
      ...[10, 11, 12, 13, 14].map(otherQueueReminderRow),
    ];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await refillAllReminders(NOW);

    for (const id of [10, 11, 12, 13, 14]) {
      expect(scheduledCountFor(id)).toBe(10);
    }
    // reminderId=1自身はkind='weekly'のQUEUE_DEPTH_BIWEEKLY(8) < quota(10)なのでdepth=8だが、
    // うち1件(2026-07-26)はスキップ日として除外されるため実際の登録は7件になる
    expect(scheduledCountFor(1)).toBe(7);
  });
});

describe('refillReminder: ネイティブ方式単体の早期return/一時キュー化(@tester指摘)', () => {
  it('スキップの無いnativeでは何もスケジュールせず早期returnする', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockSkipsTable = [];

    await refillReminder(1);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('スキップのあるnativeでは一時キュー化されscheduleQueueが呼ばれる(queueDepthFor(kind)とcomputeQuotaPerReminderのmin側が使われる)', async () => {
    mockRemindersTable = [nativeWeeklyRow()];
    mockSkipsTable = [{ reminderId: 1, skippedDate: '2026-07-26' }];

    await refillReminder(1);

    // queueReminderCount=1(自分自身のみ) → computeQuotaPerReminder(1)=60、
    // QUEUE_DEPTH_BIWEEKLY(weekly kind)=8の方が小さいのでdepth=8だが、うち1件(2026-07-26)は
    // スキップ日として除外されるため実際の登録は7件になる
    const rows = mockNotificationsTable.filter((r) => r.reminderId === 1);
    expect(rows.length).toBe(7);
    expect(rows.every((r) => r.triggerType === 'queue')).toBe(true);
  });
});
