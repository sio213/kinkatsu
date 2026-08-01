// useReminders は「一覧の取得」と「scheduler への薄い委譲」に加えて、次回発火時刻の再計算を
// 分単位のタイマーとアプリのフォアグラウンド復帰で回している。タイマーとリスナーが解除されずに
// 残ると、画面を離れた後も再レンダーが走り続ける（過去に AppState のリスナー漏れで jest の
// worker が落ちた実績がある）ので、後始末まで含めて固定する。
/* eslint-disable no-var */
var mockLiveQueryResult: { data?: unknown };
var mockScheduler: Record<string, jest.Mock>;

jest.mock('@/db/client', () => ({
  db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnThis() }) },
}));

jest.mock('@/db/schema', () => ({ reminders: { id: 'id' } }));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => mockLiveQueryResult),
}));

jest.mock('@/lib/notifications/scheduler', () => {
  mockScheduler = {
    createReminder: jest.fn(async () => 1),
    updateReminder: jest.fn(async () => undefined),
    setReminderEnabled: jest.fn(async () => undefined),
    deleteReminder: jest.fn(async () => undefined),
    sendTestNotification: jest.fn(async () => undefined),
    parseReminder: jest.fn((r: unknown) => r),
    getNextFireDate: jest.fn(() => new Date('2026-08-02T07:00:00Z')),
  };
  return mockScheduler;
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import type { Reminder } from '@/db/schema';
import { useReminders } from '@/hooks/use-reminders';

function mount() {
  let captured: ReturnType<typeof useReminders>;
  function Harness() {
    captured = useReminders();
    return null;
  }
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(Harness));
  });
  return { get: () => captured!, unmount: () => act(() => tree.unmount()) };
}

const reminder = { id: 1, enabled: true } as unknown as Reminder;

beforeEach(() => {
  jest.useFakeTimers();
  mockLiveQueryResult = { data: [] };
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useReminders', () => {
  it('data が未解決でも reminders は空配列で返す', () => {
    mockLiveQueryResult = { data: undefined };

    expect(mount().get().reminders).toEqual([]);
  });

  it('取得したリマインダーをそのまま返す', () => {
    mockLiveQueryResult = { data: [reminder] };

    expect(mount().get().reminders).toEqual([reminder]);
  });

  it('各操作を scheduler にそのまま委譲する', async () => {
    const api = mount().get();
    const input = { kind: 'weekly' } as never;

    await api.createReminder(input);
    await api.updateReminder(7, input);
    await api.toggleReminder(7, false);
    await api.removeReminder(7);
    await api.sendTest('タイトル', '本文');

    expect(mockScheduler.createReminder).toHaveBeenCalledWith(input);
    expect(mockScheduler.updateReminder).toHaveBeenCalledWith(7, input);
    expect(mockScheduler.setReminderEnabled).toHaveBeenCalledWith(7, false);
    expect(mockScheduler.deleteReminder).toHaveBeenCalledWith(7);
    expect(mockScheduler.sendTestNotification).toHaveBeenCalledWith('タイトル', '本文');
  });

  it('getNextFire は現在時刻を基準に次回発火時刻を返す', () => {
    const api = mount().get();

    const next = api.getNextFire(reminder);

    expect(mockScheduler.getNextFireDate).toHaveBeenCalledWith(reminder, api.now);
    expect(next).toEqual(new Date('2026-08-02T07:00:00Z'));
  });

  it('壊れたリマインダーで例外が出ても、一覧全体を落とさず null を返す', () => {
    mockScheduler.parseReminder.mockImplementation(() => {
      throw new Error('不正なスケジュール');
    });

    expect(mount().get().getNextFire(reminder)).toBeNull();
  });

  it('1分ごとに now を更新する', () => {
    const harness = mount();
    const before = harness.get().now;

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(harness.get().now).not.toBe(before);
  });

  it('フォアグラウンド復帰で now を更新し、それ以外の状態遷移では更新しない', () => {
    const addSpy = jest.spyOn(AppState, 'addEventListener');
    const harness = mount();
    const listener = addSpy.mock.calls[0][1] as (state: string) => void;
    const before = harness.get().now;

    act(() => listener('background'));
    expect(harness.get().now).toBe(before);

    act(() => listener('active'));
    expect(harness.get().now).not.toBe(before);

    addSpy.mockRestore();
  });

  it('アンマウントで AppState のリスナーとタイマーを両方解除する', () => {
    const remove = jest.fn();
    const addSpy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);
    const clearSpy = jest.spyOn(global, 'clearInterval');

    mount().unmount();

    expect(remove).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    addSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
