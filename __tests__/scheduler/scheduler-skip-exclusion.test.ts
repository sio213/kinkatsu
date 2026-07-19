// scheduleQueue(lib/notifications/scheduler.ts、非公開関数)が、新規に生成する未来分の候補日から
// reminderScheduleSkips(PR10-6a)に記録された日を除外することを検証する。日付計算自体の正しさは
// scheduler.test.ts、DBへ渡す行の中身はscheduler-routine-id.test.ecosystemが担当するため、ここでは
// 「スキップした日だけが除外される」ことに焦点を絞る。
//
// createReminder(新規作成時の1回きりの初期補充)に加え、実運用で繰り返し実行されrefillReminder/
// refillAllReminders(キューが減った分を継ぎ足す補充サイクル)経由でもスキップが復活しないことを
// 検証する(@reviewer Major指摘#9: refillパスは元々テストが無く、モックが常に既存キュー0件を返す
// せいでrefillの補充ロジック自体が発火するかどうかも未検証だった)
/* eslint-disable no-var */
var mockSkipRows: unknown[];
var mockReminderRowsQueue: unknown[][];
var mockReminderCallIndex: number;

const mockScheduleNotificationAsync = jest.fn();

jest.mock('@/db/client', () => ({
  db: {
    insert: jest.fn((table: unknown) => ({
      values: (row: unknown) => {
        if (table === 'reminders') {
          return { returning: () => Promise.resolve([{ ...(row as object), id: 1 }]) };
        }
        // reminderNotifications: scheduleQueueはreturningせず直接awaitする
        return Promise.resolve(undefined);
      },
    })),
    select: jest.fn(() => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === 'reminderScheduleSkips') return Promise.resolve(mockSkipRows);
          if (table === 'reminders') {
            // refillReminderは同じ'reminders'テーブルに対し
            // 1) 対象1件をidで取得 → 2) 有効な全リマインダー数(quota計算用)を取得、
            // の順で2回selectする。呼び出し順にキューから消費して別々の結果を返せるようにする
            // (テーブル名だけでは1回目と2回目を区別できないため)
            const rows = mockReminderRowsQueue[mockReminderCallIndex] ?? mockReminderRowsQueue.at(-1) ?? [];
            mockReminderCallIndex += 1;
            return Promise.resolve(rows);
          }
          // 既存キュー検索(reminderNotifications)は常に空(=まだ何も予約されていない/補充前提)
          return Promise.resolve([]);
        },
      }),
    })),
  },
}));

jest.mock('@/db/schema', () => ({
  reminders: 'reminders',
  reminderNotifications: 'reminderNotifications',
  reminderScheduleSkips: 'reminderScheduleSkips',
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conds) => ({ conds })),
  eq: jest.fn((col, val) => ({ col, val })),
  gt: jest.fn((col, val) => ({ col, val })),
  lte: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
}));
jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import { createReminder, refillAllReminders, refillReminder } from '@/lib/notifications/scheduler';
import { toDateKey } from '@/lib/calendar/date-grid';
import type { ReminderInput } from '@/lib/notifications/types';

// interval(N日ごと、N>1)はqueue方式。anchorDateを固定し、"今"を固定した状態で
// 決定論的な候補日列を作る
const ANCHOR = new Date(2026, 6, 6, 7, 0, 0).getTime(); // 2026-07-06(月) 07:00

function makeInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'interval',
    hour: 7,
    minute: 0,
    intervalDays: 7,
    anchorDate: ANCHOR,
    enabled: true,
    ...overrides,
  };
}

// refillReminder/refillAllReminders用: DB由来のreminders行そのもの(ReminderInputと違いidを持つ)
function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    routineId: 10,
    title: '胸の日',
    body: '後でじゃなく、今やる。',
    kind: 'interval',
    hour: 7,
    minute: 0,
    weekdays: null,
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

function scheduledDateKeys(): string[] {
  return mockScheduleNotificationAsync.mock.calls.map(([req]) => toDateKey(req.trigger.date));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSkipRows = [];
  mockReminderRowsQueue = [];
  mockReminderCallIndex = 0;
  jest.useFakeTimers().setSystemTime(new Date(2026, 6, 20, 0, 0, 0)); // 2026-07-20(月)
  mockScheduleNotificationAsync.mockResolvedValue('os-id');
});

afterEach(() => {
  jest.useRealTimers();
});

test('スキップが無ければ、計算された候補日がそのまま全て通知登録される', async () => {
  await createReminder(makeInput());
  const dateKeys = scheduledDateKeys();
  expect(dateKeys.length).toBeGreaterThan(0);
});

test('スキップに記録された日は、新規生成される候補日から除外され通知登録されない', async () => {
  // 1回目: スキップ無しで候補日を計算させ、そのうちの1件を後でスキップ対象にする
  await createReminder(makeInput());
  const withoutSkip = scheduledDateKeys();
  expect(withoutSkip.length).toBeGreaterThan(1);
  const targetDateKey = withoutSkip[0];

  // 2回目: 同じ入力だが、1件目の日付をスキップ済みとして登録した状態で再作成
  jest.clearAllMocks();
  mockSkipRows = [{ reminderId: 1, skippedDate: targetDateKey }];
  await createReminder(makeInput());
  const withSkip = scheduledDateKeys();

  expect(withSkip).not.toContain(targetDateKey);
  expect(withSkip.length).toBe(withoutSkip.length - 1);
  // 他の候補日は影響を受けない
  expect(withSkip).toEqual(withoutSkip.filter((k) => k !== targetDateKey));
});

test('候補日が全てスキップ対象の場合、通知登録は1件も行われずクラッシュせず正常終了する(@reviewer指摘: dates.length===0のケース未検証)', async () => {
  // 1回目: スキップ無しで候補日を全て洗い出す
  await createReminder(makeInput());
  const allDateKeys = scheduledDateKeys();
  expect(allDateKeys.length).toBeGreaterThan(0);

  // 2回目: 洗い出した候補日を全てスキップ済みとして登録した状態で再作成
  jest.clearAllMocks();
  mockSkipRows = allDateKeys.map((skippedDate) => ({ reminderId: 1, skippedDate }));
  await expect(createReminder(makeInput())).resolves.toBeDefined();
  expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
});

test('refillReminder(通知キューが減った分を継ぎ足す本番の補充サイクル)経由でも、スキップ済みの日は補充対象から除外される(@reviewer Major指摘#9)', async () => {
  mockReminderRowsQueue = [[reminderRow()], [reminderRow()]];
  await refillReminder(1);
  const withoutSkip = scheduledDateKeys();
  expect(withoutSkip.length).toBeGreaterThan(1);
  const targetDateKey = withoutSkip[0];

  jest.clearAllMocks();
  mockReminderRowsQueue = [[reminderRow()], [reminderRow()]];
  mockSkipRows = [{ reminderId: 1, skippedDate: targetDateKey }];
  await refillReminder(1);
  const withSkip = scheduledDateKeys();

  expect(withSkip).not.toContain(targetDateKey);
  expect(withSkip.length).toBe(withoutSkip.length - 1);
});

test('refillAllReminders(全リマインダー一括補充、アプリ起動時等に実行)経由でも、スキップ済みの日は補充対象から除外される(@reviewer Major指摘#9)', async () => {
  mockReminderRowsQueue = [[reminderRow()]];
  await refillAllReminders(new Date(2026, 6, 20, 0, 0, 0));
  const withoutSkip = scheduledDateKeys();
  expect(withoutSkip.length).toBeGreaterThan(1);
  const targetDateKey = withoutSkip[0];

  jest.clearAllMocks();
  mockReminderRowsQueue = [[reminderRow()]];
  mockSkipRows = [{ reminderId: 1, skippedDate: targetDateKey }];
  await refillAllReminders(new Date(2026, 6, 20, 0, 0, 0));
  const withSkip = scheduledDateKeys();

  expect(withSkip).not.toContain(targetDateKey);
  expect(withSkip.length).toBe(withoutSkip.length - 1);
});
