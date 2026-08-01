// scheduler.ts の「DBとOS通知の両方に触る」層。既存の scheduler*.test.ts はいずれも
// db を `{}` で潰して日付計算だけを見ているため、ここは実SQLite（__tests__/helpers/test-db.ts）
// の上で本物のクエリを走らせ、通知APIだけをモックする。
//
// 掃除（pruneExpiredNotifications）は取り違えると実害が大きい——native 行まで消すと
// 二度と鳴らなくなり、未来の queue 行まで消すと予定が飛ぶ。そこを中心に固定する。
/* eslint-disable no-var */
var mockScheduleNotificationAsync: jest.Mock;
var mockCancelScheduledNotificationAsync: jest.Mock;

jest.mock('@/db/client', () => {
  const { createTestDb } = require('../helpers/test-db');
  const { sqlite, db } = createTestDb();
  return { db, expoDb: sqlite, __sqlite: sqlite };
});

jest.mock('expo-notifications', () => {
  mockScheduleNotificationAsync = jest.fn(async () => 'os-id');
  mockCancelScheduledNotificationAsync = jest.fn(async () => undefined);
  return {
    scheduleNotificationAsync: mockScheduleNotificationAsync,
    cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
    getAllScheduledNotificationsAsync: jest.fn(async () => []),
    SchedulableTriggerInputTypes: {
      DATE: 'date',
      DAILY: 'daily',
      WEEKLY: 'weekly',
      MONTHLY: 'monthly',
      TIME_INTERVAL: 'timeInterval',
    },
  };
});

jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import type Database from 'better-sqlite3';
import * as dbClient from '@/db/client';
import { reminderNotifications, reminders } from '@/db/schema';
import { deleteReminder, pruneExpiredNotifications, sendTestNotification } from '@/lib/notifications/scheduler';
import { resetTestDb, type TestDb } from '../helpers/test-db';

const sqlite = (dbClient as unknown as { __sqlite: Database.Database }).__sqlite;
const db = dbClient.db as unknown as TestDb;

const NOW = new Date('2026-08-01T10:00:00Z');

async function insertReminder(): Promise<number> {
  const now = Date.now();
  const [row] = await db
    .insert(reminders)
    .values({
      title: 'トレーニング',
      body: '行こう',
      kind: 'interval',
      hour: 7,
      minute: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: reminders.id });
  return row.id;
}

async function insertNotification(opts: {
  reminderId: number;
  osNotificationId: string;
  triggerType: 'native' | 'queue';
  fireAt: number | null;
}): Promise<void> {
  await db.insert(reminderNotifications).values({ ...opts, createdAt: Date.now() });
}

async function remainingOsIds(): Promise<string[]> {
  const rows = await db
    .select({ osNotificationId: reminderNotifications.osNotificationId })
    .from(reminderNotifications);
  return rows.map((r) => r.osNotificationId).sort();
}

beforeEach(() => {
  resetTestDb(sqlite);
  jest.clearAllMocks();
});

describe('sendTestNotification', () => {
  it('2秒後に一度だけ鳴る通知を予約する', async () => {
    await sendTestNotification('テスト', '本文');

    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'テスト', body: '本文', sound: true },
      trigger: { type: 'timeInterval', seconds: 2, repeats: false },
    });
  });
});

describe('pruneExpiredNotifications', () => {
  it('発火済みの queue 行だけを消し、未来分は残す', async () => {
    const reminderId = await insertReminder();
    await insertNotification({
      reminderId,
      osNotificationId: 'past',
      triggerType: 'queue',
      fireAt: NOW.getTime() - 1_000,
    });
    await insertNotification({
      reminderId,
      osNotificationId: 'future',
      triggerType: 'queue',
      fireAt: NOW.getTime() + 1_000,
    });

    await pruneExpiredNotifications(NOW);

    expect(await remainingOsIds()).toEqual(['future']);
  });

  it('ちょうど今の時刻の queue 行は発火済みとして消す', async () => {
    const reminderId = await insertReminder();
    await insertNotification({
      reminderId,
      osNotificationId: 'now',
      triggerType: 'queue',
      fireAt: NOW.getTime(),
    });

    await pruneExpiredNotifications(NOW);

    expect(await remainingOsIds()).toEqual([]);
  });

  it('native 行は fireAt が過去でも消さない（繰り返し登録なので消すと二度と鳴らない）', async () => {
    const reminderId = await insertReminder();
    await insertNotification({
      reminderId,
      osNotificationId: 'native',
      triggerType: 'native',
      fireAt: NOW.getTime() - 10_000,
    });

    await pruneExpiredNotifications(NOW);

    expect(await remainingOsIds()).toEqual(['native']);
  });

  it('OS側の通知はキャンセルしない（発火済みなのでOSにはもう残っていない）', async () => {
    const reminderId = await insertReminder();
    await insertNotification({
      reminderId,
      osNotificationId: 'past',
      triggerType: 'queue',
      fireAt: NOW.getTime() - 1_000,
    });

    await pruneExpiredNotifications(NOW);

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('deleteReminder', () => {
  it('OS通知をすべてキャンセルし、通知行とリマインダー行を消す', async () => {
    const reminderId = await insertReminder();
    await insertNotification({ reminderId, osNotificationId: 'a', triggerType: 'native', fireAt: null });
    await insertNotification({ reminderId, osNotificationId: 'b', triggerType: 'queue', fireAt: 1 });

    await deleteReminder(reminderId);

    expect(mockCancelScheduledNotificationAsync.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b']);
    expect(await remainingOsIds()).toEqual([]);
    expect(await db.select().from(reminders)).toEqual([]);
  });

  it('OS側のキャンセルが失敗しても、DBの後始末は最後まで進める', async () => {
    const reminderId = await insertReminder();
    await insertNotification({ reminderId, osNotificationId: 'a', triggerType: 'native', fireAt: null });
    mockCancelScheduledNotificationAsync.mockRejectedValue(new Error('already gone'));

    await deleteReminder(reminderId);

    expect(await remainingOsIds()).toEqual([]);
    expect(await db.select().from(reminders)).toEqual([]);
  });

  it('他のリマインダーの通知は巻き添えにしない', async () => {
    const target = await insertReminder();
    const other = await insertReminder();
    await insertNotification({ reminderId: target, osNotificationId: 'target', triggerType: 'queue', fireAt: 1 });
    await insertNotification({ reminderId: other, osNotificationId: 'other', triggerType: 'queue', fireAt: 1 });

    await deleteReminder(target);

    expect(await remainingOsIds()).toEqual(['other']);
  });
});
