import { aggregateSchedulePrimaryCategoryByDay, type ScheduleFireRow } from '@/lib/calendar/schedule';

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
