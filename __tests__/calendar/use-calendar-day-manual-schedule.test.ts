// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockSummaries: Map<number, { exerciseCount: number; categories: string[] }>;
var mockRoutines: { id: number; name: string }[];

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({}) }),
  },
}));

jest.mock('@/db/schema', () => ({
  scheduledWorkouts: { id: 'id', routineId: 'routineId', scheduledDate: 'scheduledDate' },
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: mockRows })),
}));

jest.mock('@/hooks/use-routines', () => ({
  useRoutineExerciseSummaries: () => mockSummaries,
  useRoutines: () => ({ routines: mockRoutines }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCalendarDayManualSchedule, type ManualScheduleCard } from '@/hooks/use-calendar-day-manual-schedule';

function renderHook(selectedDate: Date) {
  let result: ManualScheduleCard[] | undefined;
  let instance!: ReturnType<typeof create>;
  function Probe({ date }: { date: Date }) {
    result = useCalendarDayManualSchedule(date);
    return null;
  }
  act(() => {
    instance = create(React.createElement(Probe, { date: selectedDate }));
  });
  return {
    result: () => result!,
    rerenderWithDate: (date: Date) => {
      act(() => {
        instance.update(React.createElement(Probe, { date }));
      });
    },
  };
}

beforeEach(() => {
  mockRows = undefined;
  mockSummaries = new Map();
  mockRoutines = [];
});

describe('useCalendarDayManualSchedule', () => {
  it('データが未定義(初回ロード中)なら空配列を返す', () => {
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  it('選択日の手動予定を、ルーティン名・カテゴリ・種目数付きで返す', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockSummaries = new Map([[10, { exerciseCount: 3, categories: ['chest', 'shoulder'] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      scheduledWorkoutId: 1,
      routineId: 10,
      routineName: '胸の日',
      categories: ['chest', 'shoulder'],
      exerciseCount: 3,
      hour: 19,
      minute: 30,
    });
  });

  it('summariesに代表カテゴリが無いルーティン(種目0件)の予定は、0種目・カテゴリ無しとして結果に含まれる（schedule-routine-picker.tsxでは0種目のルーティンも選択できるため、除外すると選んだのに二度と表示されない予定が生まれてしまう。PRレビュー指摘対応）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockSummaries = new Map();
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ routineName: '胸の日', categories: [], exerciseCount: 0 });
  });

  it('routinesにルーティン名が無い(削除済み等)場合、予定は結果に含まれない', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    mockRoutines = [];
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  it('複数の手動予定は時刻の早い順に並ぶ', () => {
    mockRows = [
      { id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 0 },
      { id: 2, routineId: 20, scheduledDate: '2026-07-25', hour: 7, minute: 0 },
    ];
    mockSummaries = new Map([
      [10, { exerciseCount: 1, categories: ['leg'] }],
      [20, { exerciseCount: 1, categories: ['chest'] }],
    ]);
    mockRoutines = [
      { id: 10, name: '夜の予定' },
      { id: 20, name: '朝の予定' },
    ];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result.map((c) => c.routineName)).toEqual(['朝の予定', '夜の予定']);
  });

  it('他の日付の手動予定は結果に含まれない（SQL側でなくJS側で日付を絞り込む）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-26', hour: 19, minute: 30 }];
    mockSummaries = new Map([[10, { exerciseCount: 1, categories: ['chest'] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  it('同一マウントのまま選択日を変えると、新しい選択日の手動予定に更新される（useLiveQueryは日付非依存のdeps=[]で購読するため、再購読ではなくJS側フィルタの再計算で追随することを保証する）', () => {
    mockRows = [
      { id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 7, minute: 0 },
      { id: 2, routineId: 20, scheduledDate: '2026-07-26', hour: 19, minute: 0 },
    ];
    mockSummaries = new Map([
      [10, { exerciseCount: 1, categories: ['chest'] }],
      [20, { exerciseCount: 1, categories: ['leg'] }],
    ]);
    mockRoutines = [
      { id: 10, name: '胸の日' },
      { id: 20, name: '脚の日' },
    ];
    const hook = renderHook(new Date(2026, 6, 25));
    expect(hook.result().map((c) => c.routineName)).toEqual(['胸の日']);

    hook.rerenderWithDate(new Date(2026, 6, 26));
    expect(hook.result().map((c) => c.routineName)).toEqual(['脚の日']);
  });
});
