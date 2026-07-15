import type { Reminder } from '@/db/schema';
import { getRoutineScheduleDisplay, summarizeCategories } from '@/lib/routines/format';

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
