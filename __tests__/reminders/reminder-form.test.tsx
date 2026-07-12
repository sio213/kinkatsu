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

async function render(props: Partial<React.ComponentProps<typeof ReminderForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  let instance!: ReturnType<typeof create>;
  await act(async () => {
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

async function press(root: ReactTestInstance, label: string | number) {
  await act(async () => {
    findChipByLabel(root, label)!.props.onPress();
  });
}

async function submit(root: ReactTestInstance) {
  await act(async () => {
    findChipByLabel(root, '保存')!.props.onPress();
  });
}

test('週次で曜日を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎週');
  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');
});

test('週次で曜日を1つ選べば保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎週');
  await press(root, '月');
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'weekly', weekdays: [1] }),
  );
});

test('月次(毎月)で日付を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('日付を1つ以上選択してください');
});

test('月次(毎月)で日付を1つ選べば保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, 1);
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', monthdays: [1] }),
  );
});

test('月次(Nヶ月ごと)は単一選択で常に値を持つためバリデーションに引っかからない', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  // 間隔の＋ボタンを押して「2ヶ月ごと」にする
  const plusBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.findAllByType(Text).some((t) => t.props.children === '＋'));
  await act(async () => {
    plusBtn!.props.onPress();
  });
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', intervalMonths: 2, monthdays: [1] }),
  );
});

test('月次(第N曜日)は日付を1つも選ばずに保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, '第N曜日');
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', nthWeek: 1, nthWeekday: 1 }),
  );
});

test('毎日(デフォルト)・毎年は曜日/日付に触れずそのまま保存できる', async () => {
  const { root: rootInterval, onSubmit: onSubmitInterval } = await render();
  await submit(rootInterval);
  expect(onSubmitInterval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'interval' }));

  const { root: rootYearly, onSubmit: onSubmitYearly } = await render();
  await press(rootYearly, '毎年');
  await submit(rootYearly);
  expect(onSubmitYearly).toHaveBeenCalledWith(expect.objectContaining({ kind: 'yearly' }));
});

test('週次で一度エラーを出した後、曜日を選び直すとエラーが消えて保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎週');
  await submit(root);
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');

  await press(root, '月');
  expect(allTexts(root)).not.toContain('曜日を1つ以上選択してください');

  await submit(root);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'weekly', weekdays: [1] }),
  );
});

test('タイトル未入力＋週次曜日未選択は両方のエラーが表示され、曜日だけ直しても保存できない', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎週');
  const titleInput = root.findByProps({ placeholder: 'タイトル' });
  await act(async () => {
    titleInput.props.onChangeText('');
  });
  await submit(root);

  expect(allTexts(root)).toContain('タイトルを入力してください');
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');

  await press(root, '月');
  await submit(root);
  expect(onSubmit).not.toHaveBeenCalled();
});
