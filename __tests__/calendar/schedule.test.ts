import {
  aggregateSchedulePrimaryCategoryByDay,
  pickRoutineRepresentativeCategories,
  type RoutineExerciseCategoryRow,
  type ScheduleFireRow,
} from '@/lib/calendar/schedule';

describe('pickRoutineRepresentativeCategories', () => {
  it('1種目のみなら、そのカテゴリが代表になる', () => {
    const rows: RoutineExerciseCategoryRow[] = [{ routineId: 1, category: 'chest', orderIndex: 0 }];
    expect(pickRoutineRepresentativeCategories(rows)).toEqual(new Map([[1, 'chest']]));
  });

  it('種目数が最も多いカテゴリが代表になる', () => {
    const rows: RoutineExerciseCategoryRow[] = [
      { routineId: 1, category: 'chest', orderIndex: 0 },
      { routineId: 1, category: 'shoulder', orderIndex: 1 },
      { routineId: 1, category: 'shoulder', orderIndex: 2 },
    ];
    expect(pickRoutineRepresentativeCategories(rows).get(1)).toBe('shoulder');
  });

  it('種目数が同数の場合は先に追加した種目(orderIndexが最小)のカテゴリが代表になる', () => {
    const rows: RoutineExerciseCategoryRow[] = [
      { routineId: 1, category: 'arm', orderIndex: 1 }, // 後から追加
      { routineId: 1, category: 'chest', orderIndex: 0 }, // 先に追加
    ];
    expect(pickRoutineRepresentativeCategories(rows).get(1)).toBe('chest');
  });

  it('複数ルーティンを同時に集計できる', () => {
    const rows: RoutineExerciseCategoryRow[] = [
      { routineId: 1, category: 'chest', orderIndex: 0 },
      { routineId: 2, category: 'leg', orderIndex: 0 },
    ];
    const result = pickRoutineRepresentativeCategories(rows);
    expect(result.get(1)).toBe('chest');
    expect(result.get(2)).toBe('leg');
  });
});

describe('aggregateSchedulePrimaryCategoryByDay', () => {
  it('1日1件のみならそのカテゴリになる', () => {
    const rows: ScheduleFireRow[] = [{ dateKey: '2026-07-20', hour: 7, minute: 0, category: 'chest' }];
    expect(aggregateSchedulePrimaryCategoryByDay(rows)).toEqual(new Map([['2026-07-20', 'chest']]));
  });

  it('同日に複数件あれば最も早い時刻のカテゴリが代表になる（セット数ではなく時刻で決まる）', () => {
    const rows: ScheduleFireRow[] = [
      { dateKey: '2026-07-20', hour: 19, minute: 0, category: 'leg' },
      { dateKey: '2026-07-20', hour: 7, minute: 0, category: 'chest' },
    ];
    expect(aggregateSchedulePrimaryCategoryByDay(rows).get('2026-07-20')).toBe('chest');
  });

  it('同時刻の場合は分(minute)まで比較する', () => {
    const rows: ScheduleFireRow[] = [
      { dateKey: '2026-07-20', hour: 7, minute: 30, category: 'leg' },
      { dateKey: '2026-07-20', hour: 7, minute: 0, category: 'chest' },
    ];
    expect(aggregateSchedulePrimaryCategoryByDay(rows).get('2026-07-20')).toBe('chest');
  });

  it('日付をまたいで独立に集計する', () => {
    const rows: ScheduleFireRow[] = [
      { dateKey: '2026-07-20', hour: 7, minute: 0, category: 'chest' },
      { dateKey: '2026-07-21', hour: 7, minute: 0, category: 'leg' },
    ];
    const result = aggregateSchedulePrimaryCategoryByDay(rows);
    expect(result.get('2026-07-20')).toBe('chest');
    expect(result.get('2026-07-21')).toBe('leg');
  });
});
