// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockSkipRows: unknown[] | undefined;
var mockSummaries: Map<number, { exerciseCount: number; categories: string[] }>;
var mockRoutines: { id: number; name: string }[];

jest.mock('@/db/client', () => {
  return {
    db: {
      select: jest.fn(() => ({
        from: jest.fn((table: string) => ({
          __table: table,
          where: jest.fn().mockReturnThis(),
        })),
      })),
    },
  };
});

// 文字列マーカーにしておき、useLiveQueryのモック側でどちらのテーブルへのクエリかを判別する
// （use-calendar-month-schedule.test.tsと同じ方針）
jest.mock('@/db/schema', () => ({
  reminders: 'reminders',
  reminderScheduleSkips: 'reminderScheduleSkips',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...conds) => ({ conds })),
  isNotNull: jest.fn((col) => ({ col, op: 'isNotNull' })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn((query: { __table: string }) => ({
    data: query.__table === 'reminderScheduleSkips' ? mockSkipRows : mockRows,
  })),
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutineExerciseSummaries: () => mockSummaries,
  useRoutines: () => ({ routines: mockRoutines }),
}));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
}));
jest.mock('@/lib/notifications/channels', () => ({ REMINDER_CHANNEL_ID: 'reminders' }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCalendarDaySchedule, type DaySchedule } from '@/hooks/use-calendar-day-schedule';

function renderHook(selectedDate: Date) {
  let result: DaySchedule | undefined;
  function Probe() {
    result = useCalendarDaySchedule(selectedDate);
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  return () => result!;
}

const BASE_REMINDER = {
  title: 'test',
  body: 'test',
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

beforeEach(() => {
  mockRows = undefined;
  mockSkipRows = undefined;
  mockSummaries = new Map();
  mockRoutines = [];
});

describe('useCalendarDaySchedule', () => {
  it('データが未定義(初回ロード中)なら空配列を返す', () => {
    const getResult = renderHook(new Date(2026, 6, 20));
    expect(getResult()).toEqual({ cards: [] });
  });

  it('選択日に発火する毎日(interval)リマインダーを、ルーティン名・カテゴリ・種目数付きで返す', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map([[10, { exerciseCount: 2, categories: ['chest', 'shoulder'] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const getResult = renderHook(new Date(2026, 6, 20));
    const result = getResult();
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      reminderId: 1,
      routineId: 10,
      routineName: '胸の日',
      categories: ['chest', 'shoulder'],
      exerciseCount: 2,
      hour: 7,
      minute: 0,
    });
  });

  it('summariesに代表カテゴリが無いルーティン(種目0件)のリマインダーは結果に含まれない', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map(); // routineId=10のエントリなし
    mockRoutines = [{ id: 10, name: '胸の日' }];
    expect(renderHook(new Date(2026, 6, 20))().cards).toEqual([]);
  });

  it('routinesにルーティン名が無い(削除済み等)場合、リマインダーは結果に含まれない', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    mockRoutines = []; // routineId=10の名前が引けない
    expect(renderHook(new Date(2026, 6, 20))().cards).toEqual([]);
  });

  it('選択日に発火しないweeklyリマインダーは結果に含まれない', () => {
    mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'weekly', weekdays: [1], hour: 7, minute: 0 }]; // 月曜
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    // 2026-07-20は月曜日ではない(火曜)想定で発火しない日を選ぶ
    const notMonday = new Date(2026, 6, 21); // 火曜
    expect(notMonday.getDay()).not.toBe(1);
    expect(renderHook(notMonday)().cards).toEqual([]);
  });

  it('複数リマインダーが同日に発火する場合、時刻の早い順に並ぶ', () => {
    mockRows = [
      { ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 19, minute: 0 },
      { ...BASE_REMINDER, id: 2, routineId: 20, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 },
    ];
    mockSummaries = new Map([
      [10, { exerciseCount: 1, categories: ['leg'] }],
      [20, { exerciseCount: 1, categories: ['chest'] }],
    ]);
    mockRoutines = [
      { id: 10, name: '夜の予定' },
      { id: 20, name: '朝の予定' },
    ];
    const getResult = renderHook(new Date(2026, 6, 20));
    expect(getResult().cards.map((c) => c.routineName)).toEqual(['朝の予定', '夜の予定']);
  });

  describe('削除済みリマインダー発火の除外(reminderScheduleSkips、2026-07-19に「今回だけスキップ」から「削除」へ変更)', () => {
    it('選択日に削除記録があるリマインダーはcardsから除外される', () => {
      mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
      mockSkipRows = [{ reminderId: 1, skippedDate: '2026-07-20' }];
      mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
      mockRoutines = [{ id: 10, name: '胸の日' }];
      const result = renderHook(new Date(2026, 6, 20))();
      expect(result.cards).toEqual([]);
    });

    it('削除記録の日付が選択日と異なる場合は除外されない', () => {
      mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
      mockSkipRows = [{ reminderId: 1, skippedDate: '2026-07-21' }]; // 別日
      mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
      mockRoutines = [{ id: 10, name: '胸の日' }];
      const result = renderHook(new Date(2026, 6, 20))();
      expect(result.cards).toHaveLength(1);
    });

    it('削除記録のreminderIdが異なる場合は除外されない', () => {
      mockRows = [{ ...BASE_REMINDER, id: 1, routineId: 10, kind: 'interval', intervalDays: 1, hour: 7, minute: 0 }];
      mockSkipRows = [{ reminderId: 999, skippedDate: '2026-07-20' }]; // 別リマインダー
      mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
      mockRoutines = [{ id: 10, name: '胸の日' }];
      const result = renderHook(new Date(2026, 6, 20))();
      expect(result.cards).toHaveLength(1);
    });
  });
});
