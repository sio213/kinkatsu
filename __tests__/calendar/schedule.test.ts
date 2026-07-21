import {
  aggregateSchedulePrimaryCategoryByDay,
  formatDirectScheduleTitle,
  groupExerciseNamesByScheduleId,
  mergeScheduleCards,
  type ScheduleFireRow,
} from '@/lib/calendar/schedule';

type TestReminderCard = {
  reminderId: number;
  routineId: number;
  title: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
  reminder: { id: number };
};

type TestManualCard = {
  scheduledWorkoutId: number;
  routineId: number | null;
  title: string;
  categories: string[];
  exerciseCount: number;
  hour: number;
  minute: number;
};

function reminderCard(overrides: Partial<TestReminderCard> = {}): TestReminderCard {
  return {
    reminderId: 1,
    routineId: 10,
    title: '胸の日',
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
    title: '脚の日',
    categories: ['leg'],
    exerciseCount: 3,
    hour: 19,
    minute: 0,
    ...overrides,
  };
}

describe('formatDirectScheduleTitle', () => {
  it('種目1件なら種目名そのまま', () => {
    expect(formatDirectScheduleTitle(['ベンチプレス'])).toBe('ベンチプレス');
  });

  it('種目2件以上なら「先頭の種目名 他N種目」', () => {
    expect(formatDirectScheduleTitle(['ベンチプレス', 'スクワット'])).toBe('ベンチプレス 他1種目');
    expect(formatDirectScheduleTitle(['ベンチプレス', 'スクワット', 'デッドリフト'])).toBe('ベンチプレス 他2種目');
  });

  it('種目0件なら空文字（呼び出し側の安全網、実運用では起こらない想定）', () => {
    expect(formatDirectScheduleTitle([])).toBe('');
  });
});

// use-calendar-direct-schedule-summaries.ts・scheduled-workout-scheduler.tsの両方が使う
// 共通集計関数（@reviewer指摘、2026-07-20に重複実装から抽出）
describe('groupExerciseNamesByScheduleId', () => {
  it('scheduledWorkoutIdごとに種目名を並び順のまま配列にまとめる', () => {
    const result = groupExerciseNamesByScheduleId([
      { scheduledWorkoutId: 1, name: 'ベンチプレス' },
      { scheduledWorkoutId: 2, name: 'スクワット' },
      { scheduledWorkoutId: 1, name: 'デッドリフト' },
    ]);
    expect(result.get(1)).toEqual(['ベンチプレス', 'デッドリフト']);
    expect(result.get(2)).toEqual(['スクワット']);
  });

  it('rowsが空なら空のMapを返す', () => {
    expect(groupExerciseNamesByScheduleId([]).size).toBe(0);
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

describe('mergeScheduleCards', () => {
  it('リマインダー予定と手動予定を時刻順にまとめる', () => {
    const merged = mergeScheduleCards([reminderCard({ hour: 19 })], [manualCard({ hour: 7 })]);
    expect(merged.map((c) => c.source)).toEqual(['manual', 'reminder']);
  });

  it('同じroutineIdがリマインダー予定・手動予定の両方にある場合、手動予定だけを残す（重複表示を防ぐ）', () => {
    const merged = mergeScheduleCards(
      [reminderCard({ routineId: 10, title: '胸の日' })],
      [manualCard({ routineId: 10, title: '胸の日' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('manual');
  });

  it('直接予定（routineId===null、2026-07-20）はリマインダーと衝突しようが無いためdedupe対象にならない', () => {
    const merged = mergeScheduleCards(
      [reminderCard({ routineId: 10, title: '胸の日' })],
      [manualCard({ routineId: null, title: 'ベンチプレス' })],
    );
    expect(merged).toHaveLength(2);
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
