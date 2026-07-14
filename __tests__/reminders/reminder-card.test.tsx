const mockReminderForm = jest.fn((_props: unknown) => null);
jest.mock('@/components/reminders/reminder-form', () => ({
  ReminderForm: (props: unknown) => mockReminderForm(props),
}));

import type { Reminder } from '@/db/schema';
import { ReminderCard, buildEditInput } from '@/components/reminders/reminder-card';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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

describe('編集フォーム(ReminderForm)のshowTitleBody: ルーティン由来のリマインダーはタイトル・本文を編集させない', () => {
  // ルーティン由来のリマインダー(routineId有り)は、ここでタイトル・本文を編集可能にしてしまうと
  // 次にルーティンを保存したタイミングでwithRoutineReminderContentにより無言で上書きされてしまう。
  // 一覧タブ経由の編集でもタイトル・本文欄を隠し、ルーティンフォーム側の編集導線と一貫させる
  let instance: ReactTestRenderer | undefined;

  function renderCard(r: Reminder) {
    mockReminderForm.mockClear();
    act(() => {
      instance = create(
        React.createElement(ReminderCard, {
          reminder: r,
          isEditing: true,
          onEdit: jest.fn(),
          onCloseEdit: jest.fn(),
          onDelete: jest.fn(),
          onToggle: jest.fn(),
          onSubmit: jest.fn(),
          getNextFire: () => null,
          now: new Date(),
        }),
      );
    });
  }

  afterEach(() => {
    act(() => {
      instance?.unmount();
    });
    instance = undefined;
  });

  test('routineIdありのリマインダーはshowTitleBody: falseで渡される', () => {
    renderCard({ ...base, routineId: 42 });
    expect(mockReminderForm.mock.calls[0][0]).toEqual(expect.objectContaining({ showTitleBody: false }));
  });

  test('単体リマインダー(routineId: null)はshowTitleBody: trueで渡される', () => {
    renderCard({ ...base, routineId: null });
    expect(mockReminderForm.mock.calls[0][0]).toEqual(expect.objectContaining({ showTitleBody: true }));
  });
});

describe('ルーティン由来のリマインダー: バッジ表示・削除ボタンの非表示', () => {
  // タスク9: 一覧タブでルーティン由来のリマインダーを区別できるようにするバッジと、
  // 削除ボタンを非表示にしてルーティン編集画面への導線に一本化する挙動の回帰テスト
  let instance: ReactTestRenderer | undefined;

  function renderCard(r: Reminder, onDelete = jest.fn(), onOpenRoutine = jest.fn()) {
    act(() => {
      instance = create(
        React.createElement(ReminderCard, {
          reminder: r,
          isEditing: false,
          onEdit: jest.fn(),
          onCloseEdit: jest.fn(),
          onDelete,
          onToggle: jest.fn(),
          onSubmit: jest.fn(),
          getNextFire: () => null,
          now: new Date(),
          onOpenRoutine,
        }),
      );
    });
    return instance!.root;
  }

  afterEach(() => {
    act(() => {
      instance?.unmount();
    });
    instance = undefined;
  });

  test('routineIdありの場合だけルーティンバッジが表示される', () => {
    const withRoutine = renderCard({ ...base, routineId: 42 });
    expect(withRoutine.findByProps({ children: 'ルーティンのリマインダー' })).toBeDefined();

    const standalone = renderCard({ ...base, routineId: null });
    expect(standalone.findAllByProps({ children: 'ルーティンのリマインダー' })).toHaveLength(0);
  });

  test('ルーティンバッジをタップするとonOpenRoutineがroutineId付きで呼ばれる', () => {
    const onOpenRoutine = jest.fn();
    const root = renderCard({ ...base, routineId: 42 }, jest.fn(), onOpenRoutine);
    const badge = root.findByProps({ accessibilityLabel: 'tはルーティンのリマインダーです。ルーティン編集画面を開く' });

    act(() => {
      badge.props.onPress();
    });

    expect(onOpenRoutine).toHaveBeenCalledWith(42);
  });

  test('routineIdありの場合、削除ボタン自体が表示されない(バッジ経由のルーティン編集画面への導線に一本化)', () => {
    const root = renderCard({ ...base, routineId: 42 });
    expect(root.findAllByProps({ accessibilityLabel: 'tを削除' })).toHaveLength(0);
  });

  test('単体リマインダー(routineId無し)は従来通り削除ボタンが表示される', () => {
    const root = renderCard({ ...base, routineId: null });
    expect(root.findByProps({ accessibilityLabel: 'tを削除' })).toBeDefined();
  });
});

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
