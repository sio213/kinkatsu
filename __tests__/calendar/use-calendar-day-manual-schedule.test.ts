// jest.mock はホイストされるため、変数は var で定義してスコープを合わせる
/* eslint-disable no-var */
var mockRows: unknown[] | undefined;
var mockRoutines: { id: number; name: string }[];
var mockDirectSummaries: Map<
  number,
  { exerciseCount: number; categories: string[]; exerciseNames: string[] }
>;

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
  useRoutines: () => ({ routines: mockRoutines }),
}));

jest.mock('@/hooks/use-calendar-direct-schedule-summaries', () => ({
  useCalendarDirectScheduleSummaries: () => mockDirectSummaries,
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
  mockRoutines = [];
  mockDirectSummaries = new Map();
});

describe('useCalendarDayManualSchedule', () => {
  it('データが未定義(初回ロード中)なら空配列を返す', () => {
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  // カテゴリ・種目数は、ルーティン紐付き予定でもルーティン本体(routineId)ではなく、この予定
  // インスタンス自身(scheduledWorkoutId)のscheduledWorkoutExercisesから取る。ルーティン紐付き
  // 予定もaddScheduledWorkout時点で種目をこのテーブルへコピーしており、以後は
  // schedule-workout-edit.tsxでインスタンス単位に編集されるため（2026-07-21統一）、
  // ルーティン本体を参照すると編集内容が反映されないバグになる（@ユーザー指摘、2026-07-21修正）
  it('選択日の手動予定を、ルーティン名・カテゴリ・種目数付きで返す（カテゴリ・種目数は予定インスタンス自身から）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockDirectSummaries = new Map([[1, { exerciseCount: 3, categories: ['chest', 'shoulder'], exerciseNames: [] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      scheduledWorkoutId: 1,
      routineId: 10,
      title: '胸の日',
      categories: ['chest', 'shoulder'],
      exerciseCount: 3,
      hour: 19,
      minute: 30,
    });
  });

  it('ルーティン予定でも編集(schedule-workout-edit.tsx)で種目・カテゴリを変更していれば、その内容がそのまま反映される（ルーティン本体の現在の中身とは異なっていてよい）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    // ルーティン本体は「胸の日」のままだが、この予定インスタンスだけ脚種目に差し替え済み、
    // という乖離状態を再現する
    mockDirectSummaries = new Map([[1, { exerciseCount: 1, categories: ['leg'], exerciseNames: ['スクワット'] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result[0]).toMatchObject({ title: '胸の日', categories: ['leg'], exerciseCount: 1 });
  });

  it('directSummariesに代表カテゴリが無い予定(種目0件)は、0種目・カテゴリ無しとして結果に含まれる（schedule-routine-picker.tsxでは0種目のルーティンも選択できるため、除外すると選んだのに二度と表示されない予定が生まれてしまう。PRレビュー指摘対応）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockDirectSummaries = new Map();
    mockRoutines = [{ id: 10, name: '胸の日' }];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: '胸の日', categories: [], exerciseCount: 0 });
  });

  it('routinesにルーティン名が無い(削除済み等)場合、予定は結果に含まれない', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
    mockDirectSummaries = new Map([[1, { exerciseCount: 1, categories: ['chest'], exerciseNames: [] }]]);
    mockRoutines = [];
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  it('複数の手動予定は時刻の早い順に並ぶ', () => {
    mockRows = [
      { id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 0 },
      { id: 2, routineId: 20, scheduledDate: '2026-07-25', hour: 7, minute: 0 },
    ];
    mockDirectSummaries = new Map([
      [1, { exerciseCount: 1, categories: ['leg'], exerciseNames: [] }],
      [2, { exerciseCount: 1, categories: ['chest'], exerciseNames: [] }],
    ]);
    mockRoutines = [
      { id: 10, name: '夜の予定' },
      { id: 20, name: '朝の予定' },
    ];
    const result = renderHook(new Date(2026, 6, 25)).result();
    expect(result.map((c) => c.title)).toEqual(['朝の予定', '夜の予定']);
  });

  it('他の日付の手動予定は結果に含まれない（SQL側でなくJS側で日付を絞り込む）', () => {
    mockRows = [{ id: 1, routineId: 10, scheduledDate: '2026-07-26', hour: 19, minute: 30 }];
    mockDirectSummaries = new Map([[1, { exerciseCount: 1, categories: ['chest'], exerciseNames: [] }]]);
    mockRoutines = [{ id: 10, name: '胸の日' }];
    expect(renderHook(new Date(2026, 6, 25)).result()).toEqual([]);
  });

  it('同一マウントのまま選択日を変えると、新しい選択日の手動予定に更新される（useLiveQueryは日付非依存のdeps=[]で購読するため、再購読ではなくJS側フィルタの再計算で追随することを保証する）', () => {
    mockRows = [
      { id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 7, minute: 0 },
      { id: 2, routineId: 20, scheduledDate: '2026-07-26', hour: 19, minute: 0 },
    ];
    mockDirectSummaries = new Map([
      [1, { exerciseCount: 1, categories: ['chest'], exerciseNames: [] }],
      [2, { exerciseCount: 1, categories: ['leg'], exerciseNames: [] }],
    ]);
    mockRoutines = [
      { id: 10, name: '胸の日' },
      { id: 20, name: '脚の日' },
    ];
    const hook = renderHook(new Date(2026, 6, 25));
    expect(hook.result().map((c) => c.title)).toEqual(['胸の日']);

    hook.rerenderWithDate(new Date(2026, 6, 26));
    expect(hook.result().map((c) => c.title)).toEqual(['脚の日']);
  });

  describe('直接追加予定（routineId===null、2026-07-20）', () => {
    it('種目名から合成したタイトル・カテゴリ・種目数を返す', () => {
      mockRows = [{ id: 1, routineId: null, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
      mockDirectSummaries = new Map([
        [1, { exerciseCount: 2, categories: ['chest', 'shoulder'], exerciseNames: ['ベンチプレス', 'ショルダープレス'] }],
      ]);
      const result = renderHook(new Date(2026, 6, 25)).result();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        scheduledWorkoutId: 1,
        routineId: null,
        title: 'ベンチプレス 他1種目',
        categories: ['chest', 'shoulder'],
        exerciseCount: 2,
        hour: 19,
        minute: 30,
      });
    });

    // 2026-07-22、schedule-workout-edit.tsxの⋮「削除」で最後の1種目まで削除できるように
    // なったため、directSummariesにエントリが無い（0件）状態は日常的に到達しうる。ここでcontinueして
    // カードごと消すと、選択日パネルから二度と辿り着けなくなる（@designer指摘: 実際に発生する
    // バグだった）ため、ルーティン予定と同じく0件・カテゴリ無しにフォールバックして表示する
    it('directSummariesに対応するエントリが無い場合（0件の直接予定）は0件・カテゴリ無しにフォールバックして表示される', () => {
      mockRows = [{ id: 1, routineId: null, scheduledDate: '2026-07-25', hour: 19, minute: 30 }];
      mockDirectSummaries = new Map();
      const result = renderHook(new Date(2026, 6, 25)).result();
      expect(result).toEqual([
        {
          scheduledWorkoutId: 1,
          routineId: null,
          title: '種目未設定',
          categories: [],
          exerciseCount: 0,
          hour: 19,
          minute: 30,
        },
      ]);
    });

    it('ルーティン予定と直接予定が同日に混在しても両方時刻順で返る', () => {
      mockRows = [
        { id: 1, routineId: 10, scheduledDate: '2026-07-25', hour: 19, minute: 0 },
        { id: 2, routineId: null, scheduledDate: '2026-07-25', hour: 7, minute: 0 },
      ];
      mockDirectSummaries = new Map([
        [1, { exerciseCount: 1, categories: ['leg'], exerciseNames: [] }],
        [2, { exerciseCount: 1, categories: ['chest'], exerciseNames: ['ベンチプレス'] }],
      ]);
      mockRoutines = [{ id: 10, name: '夜の予定' }];
      const result = renderHook(new Date(2026, 6, 25)).result();
      expect(result.map((c) => c.title)).toEqual(['ベンチプレス', '夜の予定']);
    });
  });
});
