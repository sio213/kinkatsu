import type { Reminder } from '@/db/schema';
import {
  getRoutineScheduleDisplay,
  pickRepresentativeSet,
  summarizeCategories,
  summarizeRoutineExerciseSets,
} from '@/lib/routines/format';

function set(weight: number | null, reps: number | null, durationSeconds: number | null = null, distanceMeters: number | null = null) {
  return { weight, reps, durationSeconds, distanceMeters };
}

describe('summarizeCategories', () => {
  test('0件でも例外を投げず空配列を返す', () => {
    expect(summarizeCategories([])).toEqual({ visible: [], overflowCount: 0 });
  });

  test('1件はそのままvisibleになりoverflowCountは0', () => {
    expect(summarizeCategories(['胸'])).toEqual({ visible: ['胸'], overflowCount: 0 });
  });

  test('ちょうど3件は境界値としてそのまま全件表示される', () => {
    expect(summarizeCategories(['胸', '肩', '腕'])).toEqual({ visible: ['胸', '肩', '腕'], overflowCount: 0 });
  });

  test('4件目以降は先頭3件+overflowCountに丸められる（境界値）', () => {
    expect(summarizeCategories(['胸', '肩', '腕', '背中'])).toEqual({
      visible: ['胸', '肩', '腕'],
      overflowCount: 1,
    });
  });

  test('大量にあっても先頭3件+残数になる', () => {
    expect(summarizeCategories(['胸', '肩', '腕', '背中', '脚', 'お尻', '有酸素', '体幹'])).toEqual({
      visible: ['胸', '肩', '腕'],
      overflowCount: 5,
    });
  });

  test('並び順(=種目追加順で呼び出し側が渡す順)を変えずそのまま先頭から使う', () => {
    expect(summarizeCategories(['脚', '胸', '肩', '腕'])).toEqual({
      visible: ['脚', '胸', '肩'],
      overflowCount: 1,
    });
  });
});

describe('getRoutineScheduleDisplay', () => {
  const enabledReminder: Reminder = {
    id: 1,
    routineId: 10,
    title: 't',
    body: 'b',
    kind: 'weekly',
    hour: 7,
    minute: 0,
    weekdays: '[1,4]',
    monthdays: null,
    anchorDate: null,
    intervalDays: 7,
    intervalMonths: null,
    nthWeek: null,
    nthWeekdays: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };

  test('reminderがnullなら「リマインダーなし」・非アクティブになる', () => {
    expect(getRoutineScheduleDisplay(null)).toEqual({ label: 'リマインダーなし', active: false });
  });

  test('reminderがあり有効(enabled:true)ならformatKindSummaryの文言・アクティブになる', () => {
    expect(getRoutineScheduleDisplay(enabledReminder)).toEqual({ label: '毎週 月・木 07:00', active: true });
  });

  test('reminderはあるがトグルOFF(enabled:false)なら、設定は残っていても「リマインダーなし」扱いになる', () => {
    const disabled: Reminder = { ...enabledReminder, enabled: false };
    expect(getRoutineScheduleDisplay(disabled)).toEqual({ label: 'リマインダーなし', active: false });
  });

  test('kindがweekly以外でも特定kindに依存せずformatKindSummaryの結果をそのまま使う', () => {
    const monthlyReminder: Reminder = {
      ...enabledReminder,
      kind: 'monthly',
      weekdays: null,
      monthdays: '[1]',
      intervalDays: null,
    };
    expect(getRoutineScheduleDisplay(monthlyReminder)).toEqual({ label: '毎月 1日 07:00', active: true });
  });
});

describe('pickRepresentativeSet: weight_reps', () => {
  test('最大重量のセットを代表として選ぶ', () => {
    const sets = [set(60, 8), set(60, 8), set(55, 8)];
    expect(pickRepresentativeSet('weight_reps', sets)).toEqual(set(60, 8));
  });

  test('最大重量が同値のセットが複数ある場合は回数が多い方を優先する', () => {
    const sets = [set(60, 6), set(60, 10), set(60, 8)];
    expect(pickRepresentativeSet('weight_reps', sets)).toEqual(set(60, 10));
  });

  test('全セット未入力(weight null)ならnullを返す', () => {
    const sets = [set(null, null), set(null, null)];
    expect(pickRepresentativeSet('weight_reps', sets)).toBeNull();
  });

  test('セット0件ならnullを返す', () => {
    expect(pickRepresentativeSet('weight_reps', [])).toBeNull();
  });

  test('一部のセットのみ未入力の場合、入力済みのセットから選ぶ', () => {
    const sets = [set(null, null), set(50, 10)];
    expect(pickRepresentativeSet('weight_reps', sets)).toEqual(set(50, 10));
  });
});

describe('pickRepresentativeSet: 単一指標の計測タイプ', () => {
  test('repsは回数が最大のセットを選ぶ', () => {
    const sets = [set(null, 10), set(null, 15), set(null, 12)];
    expect(pickRepresentativeSet('reps', sets)).toEqual(set(null, 15));
  });

  test('timeは時間が最大のセットを選ぶ', () => {
    const sets = [set(null, null, 30), set(null, null, 60)];
    expect(pickRepresentativeSet('time', sets)).toEqual(set(null, null, 60));
  });

  test('distance_timeは距離が最大のセットを選ぶ', () => {
    const sets = [set(null, null, null, 1000), set(null, null, null, 3000)];
    expect(pickRepresentativeSet('distance_time', sets)).toEqual(set(null, null, null, 3000));
  });

  test('weight_timeは重量が最大、同値なら時間が長い方を選ぶ', () => {
    const sets = [set(20, null, 30), set(20, null, 60), set(15, null, 90)];
    expect(pickRepresentativeSet('weight_time', sets)).toEqual(set(20, null, 60));
  });
});

describe('summarizeRoutineExerciseSets', () => {
  test('0件は「0セット」になる', () => {
    expect(summarizeRoutineExerciseSets('weight_reps', [])).toBe('0セット');
  });

  test('代表セットが決まる場合は「Nセット・{代表セット}」になる', () => {
    const sets = [set(60, 8), set(60, 8), set(55, 8)];
    expect(summarizeRoutineExerciseSets('weight_reps', sets)).toBe('3セット・60kg×8');
  });

  test('全セット未入力の場合は件数のみにフォールバックする', () => {
    const sets = [set(null, null)];
    expect(summarizeRoutineExerciseSets('weight_reps', sets)).toBe('1セット');
  });

  test('reps計測は単位付きで表示される', () => {
    const sets = [set(null, 10), set(null, 15)];
    expect(summarizeRoutineExerciseSets('reps', sets)).toBe('2セット・15回');
  });
});
