import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ReminderForm } from '@/components/reminders/reminder-form';

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

async function pressMonthlyIntervalPlus(root: ReactTestInstance) {
  const plusBtn = root
    .findAllByType(TouchableOpacity)
    .find((btn) => btn.findAllByType(Text).some((t) => t.props.children === '＋'));
  await act(async () => {
    plusBtn!.props.onPress();
  });
}

test('月次(Nヶ月ごと)は毎月と同じく日付を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  // 間隔の＋ボタンを押して「2ヶ月ごと」にする
  await pressMonthlyIntervalPlus(root);
  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('日付を1つ以上選択してください');
});

test('月次(Nヶ月ごと)は毎月と同じく日付を複数選択して保存でき、anchorDateも補完される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await pressMonthlyIntervalPlus(root);
  await press(root, 1);
  await press(root, 15);
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'monthly',
      intervalMonths: 2,
      monthdays: [1, 15],
      anchorDate: expect.any(Number),
    }),
  );
});

test('月次(Nヶ月ごと)は毎月と同じく日付選択後にもう一度押すと選択解除できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await pressMonthlyIntervalPlus(root);
  await press(root, 1);
  await press(root, 15);
  await press(root, 1); // 1日だけ解除
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', intervalMonths: 2, monthdays: [15] }),
  );
});

test('月次(Nヶ月ごと)は毎月と同じく31日と月末が相互排他になる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await pressMonthlyIntervalPlus(root);
  await press(root, 31);
  await press(root, '月末'); // 月末を選ぶと31日は自動で外れる
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', intervalMonths: 2, monthdays: [99] }),
  );
});

test('月次(Nヶ月ごと)を編集で開くと選択済みの日付が復元される', async () => {
  const { root, onSubmit } = await render({
    initial: {
      title: '既存のリマインダー',
      body: '本文',
      kind: 'monthly',
      hour: 7,
      minute: 0,
      intervalMonths: 3,
      monthdays: [1, 15],
      anchorDate: Date.now(),
      enabled: true,
    },
  });

  // チップを操作せずそのまま保存し、復元された選択がそのまま送信されることを確認する
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', intervalMonths: 3, monthdays: [1, 15] }),
  );
});

test('月次(第N曜日)は毎週と同じく曜日を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, '第N曜日');
  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');
});

test('月次(第N曜日)は毎週と同じく曜日を複数選択して保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, '第N曜日');
  await press(root, '月');
  await press(root, '水');
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', nthWeek: 1, nthWeekdays: [1, 3] }),
  );
});

test('月次(第N曜日)は毎週と同じく曜日選択後にもう一度押すと選択解除できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, '第N曜日');
  await press(root, '月');
  await press(root, '水');
  await press(root, '月'); // 月だけ解除
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', nthWeek: 1, nthWeekdays: [3] }),
  );
});

test('月次(第N曜日)を編集で開くと選択済みの複数曜日が復元される', async () => {
  const { root, onSubmit } = await render({
    initial: {
      title: '既存のリマインダー',
      body: '本文',
      kind: 'monthly',
      hour: 7,
      minute: 0,
      intervalMonths: 1,
      nthWeek: 2,
      nthWeekdays: [1, 3],
      enabled: true,
    },
  });

  // チップを操作せずそのまま保存し、復元された選択がそのまま送信されることを確認する
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', nthWeek: 2, nthWeekdays: [1, 3] }),
  );
});

test('weeklyで曜日を選択後にmonthly(第N曜日)へ切り替えても選択状態が混線しない', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎週');
  await press(root, '月'); // weekly.weekdays = [1]

  await press(root, '毎月');
  await press(root, '第N曜日'); // monthNthWeekdaysは初期値[]のまま

  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');
});

test('monthDayMode==="nth"のとき、日付(1〜31)グリッドは画面上に存在しない', async () => {
  const { root } = await render();
  await press(root, '毎月');
  await press(root, '第N曜日');
  expect(findChipByLabel(root, 1)).toBeUndefined();
});

test('月次(第N曜日)で一度エラーを出した後、日付モードに切り替えると第N曜日のエラーは表示されず日付選択だけで保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎月');
  await press(root, '第N曜日');
  await submit(root);
  expect(allTexts(root)).toContain('曜日を1つ以上選択してください');

  await press(root, '日付');
  expect(allTexts(root)).not.toContain('曜日を1つ以上選択してください');

  await press(root, 1);
  await submit(root);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'monthly', monthdays: [1] }),
  );
});

test('毎日(デフォルト)は曜日/日付に触れずそのまま保存できる', async () => {
  const { root: rootInterval, onSubmit: onSubmitInterval } = await render();
  await submit(rootInterval);
  expect(onSubmitInterval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'interval' }));
});

test('毎年は毎月と同じく日付を1つも選ばずに保存するとonSubmitは呼ばれずエラーが表示される', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎年');
  await submit(root);

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('日付を1つ以上選択してください');
});

test('毎年は毎月と同じく日付を複数選択して保存できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎年');
  await press(root, 1);
  await press(root, 15);
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'yearly', monthdays: [1, 15] }),
  );
});

test('毎年は毎月と同じく日付選択後にもう一度押すと選択解除できる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎年');
  await press(root, 1);
  await press(root, 15);
  await press(root, 1); // 1日だけ解除
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'yearly', monthdays: [15] }),
  );
});

test('毎年は毎月と同じく31日と月末が相互排他になる', async () => {
  const { root, onSubmit } = await render();

  await press(root, '毎年');
  await press(root, 31);
  await press(root, '月末'); // 月末を選ぶと31日は自動で外れる
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'yearly', monthdays: [99] }),
  );
});

test('毎年を編集で開くと選択済みの複数日付が復元される', async () => {
  const { root, onSubmit } = await render({
    initial: {
      title: '既存のリマインダー',
      body: '本文',
      kind: 'yearly',
      hour: 7,
      minute: 0,
      anchorDate: new Date(2026, 2, 1).getTime(), // 3月
      monthdays: [1, 15],
      enabled: true,
    },
  });

  // チップを操作せずそのまま保存し、復元された選択がそのまま送信されることを確認する
  await submit(root);

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'yearly', monthdays: [1, 15] }),
  );
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

describe('routineIdの引き継ぎ', () => {
  // routineIdはreminderFormSchemaに含まれないフォーム外の値のため、toFormValues/toReminderInputの
  // 往復では消えてしまう。initialから直接引き継ぐ実装になっているかの回帰テスト
  test('initialにroutineIdがあれば、編集して保存してもonSubmitのペイロードに引き継がれる', async () => {
    const { root, onSubmit } = await render({
      initial: {
        title: '胸の日',
        body: '後でじゃなく、今やる。',
        kind: 'interval',
        hour: 18,
        minute: 0,
        intervalDays: 1,
        enabled: true,
        routineId: 42,
      },
    });

    await submit(root);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ routineId: 42 }));
  });

  test('initialにroutineIdが無ければ(単体リマインダー)、保存してもnullのまま', async () => {
    const { root, onSubmit } = await render();

    await submit(root);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ routineId: null }));
  });
});

describe('showTitleBody: タイトル・通知内容欄の表示切り替え', () => {
  test('デフォルト(true)ではタイトル・通知内容欄が表示される', async () => {
    const { root } = await render();

    expect(root.findByProps({ placeholder: 'タイトル' })).toBeDefined();
    expect(root.findByProps({ placeholder: '通知内容' })).toBeDefined();
  });

  test('falseにするとタイトル・通知内容欄が表示されない', async () => {
    const { root } = await render({ showTitleBody: false });

    expect(() => root.findByProps({ placeholder: 'タイトル' })).toThrow();
    expect(() => root.findByProps({ placeholder: '通知内容' })).toThrow();
  });

  test('タイトル・通知内容欄を隠していても、initialの値のまま保存できる(ユーザー入力欄が無いだけでバリデーションは素通り)', async () => {
    const { root, onSubmit } = await render({
      showTitleBody: false,
      initial: {
        title: '胸の日',
        body: '後でじゃなく、今やる。',
        kind: 'interval',
        hour: 18,
        minute: 0,
        intervalDays: 1,
        enabled: true,
      },
    });

    await submit(root);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: '胸の日', body: '後でじゃなく、今やる。' }),
    );
  });

  test('繰り返し種別(週次等)の選択・エラー表示は隠した状態でも通常どおり機能する', async () => {
    const { root, onSubmit } = await render({ showTitleBody: false });

    await press(root, '毎週');
    await submit(root);
    expect(allTexts(root)).toContain('曜日を1つ以上選択してください');

    await press(root, '月');
    await submit(root);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'weekly', weekdays: [1] }));
  });
});
