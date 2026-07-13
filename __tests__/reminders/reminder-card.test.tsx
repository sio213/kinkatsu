import type { Reminder } from '@/db/schema';
import { buildEditInput } from '@/components/reminders/reminder-card';

const base: Reminder = {
  id: 1,
  routineId: null,
  title: 't',
  body: 'b',
  kind: 'yearly',
  hour: 7,
  minute: 0,
  weekdays: null,
  monthdays: null,
  anchorDate: null,
  intervalDays: null,
  intervalMonths: null,
  nthWeek: null,
  nthWeekdays: null,
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('buildEditInput: routineIdの引き継ぎ', () => {
  // ルーティン由来のリマインダーをこの経路で編集・保存しても紐付けが消えないことの回帰テスト。
  // updateReminderはinputにroutineIdが無ければnullとして保存するため、ここで引き継ぎ忘れると
  // 保存のたびにルーティンとの紐付けが切れてしまう
  test('routineIdが設定されたリマインダーはinputにもそのまま引き継がれる', () => {
    const r: Reminder = { ...base, routineId: 42 };
    expect(buildEditInput(r).routineId).toBe(42);
  });

  test('単体リマインダー(routineId: null)はnullのまま', () => {
    expect(buildEditInput(base).routineId).toBeNull();
  });
});

describe('buildEditInput: 毎年(旧形式)の後方互換', () => {
  test('monthdays未設定(旧形式)の毎年は、anchorDateの日から編集用inputを復元する', () => {
    const r: Reminder = { ...base, anchorDate: new Date(2026, 2, 15).getTime(), monthdays: null };
    const input = buildEditInput(r);
    expect(input.monthdays).toEqual([15]);
  });

  test('monthdays設定済み(新形式)ならそのままJSON.parseして使う', () => {
    const r: Reminder = { ...base, anchorDate: new Date(2026, 2, 1).getTime(), monthdays: '[1,15]' };
    const input = buildEditInput(r);
    expect(input.monthdays).toEqual([1, 15]);
  });

  test('yearly以外はanchorDateがあってもフォールバックせずundefinedのまま', () => {
    const r: Reminder = { ...base, kind: 'interval', anchorDate: new Date(2026, 2, 15).getTime(), monthdays: null };
    const input = buildEditInput(r);
    expect(input.monthdays).toBeUndefined();
  });
});
