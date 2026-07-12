import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ReminderForm } from '@/components/reminders/reminder-form';

// scheduler.tsはdb/client経由でexpo-sqliteを読み込みJest環境で解決できないため、
// reminder-form.tsxが使うresolveMonthDay（純粋関数）のみ最小限モックする
jest.mock('@/lib/notifications/scheduler', () => ({
  resolveMonthDay: (year: number, month: number, day: number) => {
    const MONTH_END = 99;
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (day === MONTH_END || day > lastDay) return lastDay;
    return day;
  },
}));

function findChipByLabel(root: ReactTestInstance, label: string | number) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => t.props.children === label),
    );
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t: ReactTestInstance) => t.props.children)
    .flat();
}

function render(props: Partial<React.ComponentProps<typeof ReminderForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(ReminderForm, {
        onSubmit,
        onCancel,
        submitLabel: '保存',
        ...props,
      }),
    );
  });
  return { root: instance.root, onSubmit };
}

function submit(root: ReactTestInstance) {
  const btn = findChipByLabel(root, '保存');
  act(() => {
    btn!.props.onPress();
  });
}

test('週次で曜日を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', () => {
  const { root, onSubmit } = render();

  act(() => {
    findChipByLabel(root, '毎週')!.props.onPress();
  });
  submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');
});

test('週次で曜日を1つ選べば保存できる', () => {
  const { root, onSubmit } = render();

  act(() => {
    findChipByLabel(root, '毎週')!.props.onPress();
  });
  act(() => {
    findChipByLabel(root, '月')!.props.onPress();
  });
  submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'weekly', weekdays: [1] }),
  );
});

test('月次(毎月)で日付を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', () => {
  const { root, onSubmit } = render();

  act(() => {
    findChipByLabel(root, '毎月')!.props.onPress();
  });
  submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('日付を1つ以上選択してください');
});

test('月次(毎月)で日付を1つ選べば保存できる', () => {
  const { root, onSubmit } = render();

  act(() => {
    findChipByLabel(root, '毎月')!.props.onPress();
  });
  act(() => {
    findChipByLabel(root, 1)!.props.onPress();
  });
  submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', monthdays: [1] }),
  );
});

test('月次(Nヶ月ごと)は単一選択で常に値を持つためバリデーションに引っかからない', () => {
  const { root, onSubmit } = render();

  act(() => {
    findChipByLabel(root, '毎月')!.props.onPress();
  });
  // 間隔の＋ボタンを押して「2ヶ月ごと」にする
  const stepperButtons = root.findAllByType(TouchableOpacity).filter((btn) =>
    btn.findAllByType(Text).some((t) => t.props.children === '＋'),
  );
  act(() => {
    stepperButtons[0].props.onPress();
  });
  submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', intervalMonths: 2, monthdays: [1] }),
  );
});
