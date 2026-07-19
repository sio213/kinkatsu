// scheduleQueue(lib/notifications/scheduler.ts、createReminder経由でのみ呼べる非公開関数)が、
// 新規に生成する未来分の候補日からreminderScheduleSkips(PR10-6a)に記録された日を除外することを
// 検証する。日付計算自体の正しさはscheduler.test.ts、DBへ渡す行の中身はscheduler-routine-id.test.ts
// が担当するため、ここでは「スキップした日だけが除外される」ことに焦点を絞る
/* eslint-disable no-var */
var mockSkipRows: unknown[];

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
          // 既存キュー検索(reminderNotifications)は常に空(=まだ何も予約されていない新規作成)、
          // スキップ検索(reminderScheduleSkips)だけテストごとに差し替える
          if (table === 'reminderScheduleSkips') return Promise.resolve(mockSkipRows);
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

import { createReminder } from '@/lib/notifications/scheduler';
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

function scheduledDateKeys(): string[] {
  return mockScheduleNotificationAsync.mock.calls.map(([req]) => toDateKey(req.trigger.date));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSkipRows = [];
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
