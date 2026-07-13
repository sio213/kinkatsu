import { withRoutineReminderContent } from '@/lib/routines/reminder-input';
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
