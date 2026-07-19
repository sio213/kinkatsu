import { aggregateSchedulePrimaryCategoryByDay, mergeScheduleCards, type ScheduleFireRow } from '@/lib/calendar/schedule';

type TestReminderCard = {
  reminderId: number;
  routineId: number;
  routineName: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
  reminder: { id: number };
};

type TestManualCard = {
  scheduledWorkoutId: number;
  routineId: number;
  routineName: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
};

function reminderCard(overrides: Partial<TestReminderCard> = {}): TestReminderCard {
  return {
    reminderId: 1,
    routineId: 10,
    routineName: '胸の日',
    categories: ['chest'],
    exerciseCount: 2,
    hour: 7,
    minute: 0,
    reminder: { id: 1 },
    ...overrides,
  };
}

function manualCard(overrides: Partial<TestManualCard> = {}): TestManualCard {
  return {
    scheduledWorkoutId: 1,
    routineId: 20,
    routineName: '脚の日',
    categories: ['leg'],
    exerciseCount: 3,
    hour: 19,
    minute: 0,
    ...overrides,
  };
}

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

describe('mergeScheduleCards', () => {
  it('リマインダー予定と手動予定を時刻順にまとめる', () => {
    const merged = mergeScheduleCards([reminderCard({ hour: 19 })], [manualCard({ hour: 7 })]);
    expect(merged.map((c) => c.source)).toEqual(['manual', 'reminder']);
  });

  it('同じroutineIdがリマインダー予定・手動予定の両方にある場合、手動予定だけを残す（重複表示を防ぐ）', () => {
    const merged = mergeScheduleCards(
      [reminderCard({ routineId: 10, routineName: '胸の日' })],
      [manualCard({ routineId: 10, routineName: '胸の日' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('manual');
  });

  it('routineIdが異なれば両方とも残る', () => {
    const merged = mergeScheduleCards([reminderCard({ routineId: 10 })], [manualCard({ routineId: 20 })]);
    expect(merged).toHaveLength(2);
  });

  it('各エントリのkeyはsource+idで一意になる（reminderIdとscheduledWorkoutIdの値域が重複しても衝突しない）', () => {
    const merged = mergeScheduleCards(
      [reminderCard({ reminderId: 1, routineId: 10 })],
      [manualCard({ scheduledWorkoutId: 1, routineId: 20 })],
    );
    const keys = merged.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reminderCards/manualCardsとも空なら空配列', () => {
    expect(mergeScheduleCards([], [])).toEqual([]);
  });

  it('同一routineIdの手動予定が同日に複数件あっても、どちらも残る（manual同士はdedupeしない）', () => {
    const merged = mergeScheduleCards(
      [],
      [
        manualCard({ scheduledWorkoutId: 1, routineId: 20, hour: 7 }),
        manualCard({ scheduledWorkoutId: 2, routineId: 20, hour: 19 }),
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.key)).toEqual(['manual-1', 'manual-2']);
  });
});
