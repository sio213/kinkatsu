import { previewNextFireDate, previewReminderSummary, withRoutineReminderContent } from '@/lib/routines/reminder-input';
import { DEFAULT_REMINDER_BODY } from '@/lib/notifications/messages';
import type { ReminderInput } from '@/lib/notifications/types';

function makeInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    title: 'ユーザーが入力したタイトル',
    body: 'ユーザーが入力した本文',
    kind: 'interval',
    hour: 18,
    minute: 0,
    intervalDays: 1,
    enabled: true,
    ...overrides,
  };
}

test('title/bodyをルーティン名+既定文言で上書きし、routineIdを付与する', () => {
  const result = withRoutineReminderContent(makeInput(), 42, '胸の日');

  expect(result.routineId).toBe(42);
  expect(result.title).toBe('胸の日');
  expect(result.body).toBe(DEFAULT_REMINDER_BODY);
});

test('title/body以外のスケジュール設定はそのまま保持する', () => {
  const input = makeInput({ kind: 'weekly', weekdays: [1, 3], intervalDays: 7 });
  const result = withRoutineReminderContent(input, 1, '脚の日');

  expect(result.kind).toBe('weekly');
  expect(result.weekdays).toEqual([1, 3]);
  expect(result.intervalDays).toBe(7);
});

test('既にroutineId/titleが設定済みのinput(ルーティン名変更後の再保存)でも渡した引数の値で上書きされる', () => {
  const input = makeInput({ routineId: 1, title: '古いルーティン名' });
  const result = withRoutineReminderContent(input, 1, '新しいルーティン名');

  expect(result.title).toBe('新しいルーティン名');
});

describe('previewReminderSummary', () => {
  test('毎日の頻度要約を返す', () => {
    const input = makeInput({ kind: 'interval', intervalDays: 1, hour: 7, minute: 30 });
    expect(previewReminderSummary(input)).toBe('毎日 07:30');
  });

  test('毎週(複数曜日)の頻度要約を返す', () => {
    const input = makeInput({ kind: 'weekly', weekdays: [1, 3, 5], intervalDays: 7, hour: 18, minute: 0 });
    expect(previewReminderSummary(input)).toContain('毎週');
  });

  // toScheduleFieldsが特定のフィールド(nthWeek/anchorDate等)を組み立て損ねても、interval/weeklyの
  // 単純なケースでは気づけない(該当フィールドが元々使われないため)。monthly-nth/yearly/Nヶ月ごとは
  // それぞれ異なるフィールドの組み合わせを要求するため、個別にカバーしてキャストの安全性を担保する
  test('毎月(日付指定)の頻度要約を返す', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 1, monthdays: [1, 15], hour: 9, minute: 0 });
    expect(previewReminderSummary(input)).toBe('毎月 1日・15日 09:00');
  });

  test('毎月(第N曜日指定)の頻度要約を返す', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 1, nthWeek: 2, nthWeekdays: [1, 3], hour: 9, minute: 0 });
    expect(previewReminderSummary(input)).toBe('毎月第2月・水曜日 09:00');
  });

  test('Nヶ月ごと(intervalMonths>1)の頻度要約を返す', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 3, monthdays: [1], hour: 9, minute: 0 });
    expect(previewReminderSummary(input)).toBe('3ヶ月ごと 1日 09:00');
  });

  test('毎年の頻度要約を返す', () => {
    const input = makeInput({
      kind: 'yearly',
      anchorDate: new Date(2026, 2, 1).getTime(),
      monthdays: [15],
      hour: 9,
      minute: 0,
    });
    expect(previewReminderSummary(input)).toBe('毎年 3月15日 09:00');
  });
});

describe('previewNextFireDate', () => {
  test('毎日は次の発火時刻を返す', () => {
    const input = makeInput({ kind: 'interval', intervalDays: 1, hour: 7, minute: 0 });
    const from = new Date('2026-01-05T10:00:00');

    const result = previewNextFireDate(input, from);

    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(7);
    expect(result!.getMinutes()).toBe(0);
    expect(result!.getTime()).toBeGreaterThan(from.getTime());
  });

  test('毎週で曜日が未選択(0件)ならnullを返す(getNextFireDateの既存挙動を踏襲)', () => {
    const input = makeInput({ kind: 'weekly', weekdays: [], intervalDays: 7 });
    expect(previewNextFireDate(input, new Date('2026-01-05T10:00:00'))).toBeNull();
  });

  test('毎月(日付指定)は次の発火時刻を返す', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 1, monthdays: [20], hour: 9, minute: 0 });
    const result = previewNextFireDate(input, new Date('2026-01-05T10:00:00'));
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(20);
  });

  test('毎月(第N曜日指定)は次の発火時刻を返す', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 1, nthWeek: 2, nthWeekdays: [1], hour: 9, minute: 0 });
    const result = previewNextFireDate(input, new Date('2026-01-05T10:00:00'));
    expect(result).not.toBeNull();
  });

  test('毎年はanchorDateから月を判定して次の発火時刻を返す', () => {
    const input = makeInput({
      kind: 'yearly',
      anchorDate: new Date(2026, 2, 1).getTime(),
      monthdays: [15],
      hour: 9,
      minute: 0,
    });
    const result = previewNextFireDate(input, new Date('2026-01-05T10:00:00'));
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(2);
    expect(result!.getDate()).toBe(15);
  });

  test('Nヶ月ごと(intervalMonths>1)はanchorDateが無ければnullを返す(getNextFireDateの既存挙動)', () => {
    const input = makeInput({ kind: 'monthly', intervalMonths: 3, monthdays: [1], hour: 9, minute: 0 });
    expect(previewNextFireDate(input, new Date('2026-01-05T10:00:00'))).toBeNull();
  });

  test('interval>1はanchorDateがあれば次の発火時刻を返す', () => {
    const input = makeInput({
      kind: 'interval',
      intervalDays: 3,
      anchorDate: new Date('2026-01-01T09:00:00').getTime(),
      hour: 9,
      minute: 0,
    });
    const result = previewNextFireDate(input, new Date('2026-01-05T10:00:00'));
    expect(result).not.toBeNull();
  });
});
