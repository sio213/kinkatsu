import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Switch, Text, TextInput, TouchableOpacity } from 'react-native';
import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';

function getInputs(root: ReactTestInstance) {
  return root.findAllByType(TextInput);
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
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

async function renderForm(props: Partial<React.ComponentProps<typeof ExerciseForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(ExerciseForm, { onSubmit, onCancel, ...props }),
    );
  });
  return { root: instance.root, onSubmit, onCancel };
}

test('未入力で送信するとバリデーションエラーが表示され onSubmit は呼ばれない', async () => {
  const { root, onSubmit } = await renderForm();

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  const texts = allTexts(root);
  expect(texts).toContain('種目名を入力してください');
  expect(texts).toContain('カテゴリを選択してください');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('name・categoryを入力して送信すると trim・null化された値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('  ベンチプレス  ');
  });

  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    muscle: null,
    formPoints: [],
  });
});

test('キャンセル押下では onCancel のみ呼ばれ onSubmit は呼ばれない', async () => {
  const { root, onSubmit, onCancel } = await renderForm();

  const cancelBtn = findButtonByLabel(root, 'キャンセル')!;
  await act(async () => {
    cancelBtn.props.onPress();
  });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('編集モード: initialの値がフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: { name: '腕立て伏せ', category: 'chest', note: '週2回' },
    submitLabel: '保存',
  });

  const inputs = getInputs(root);
  expect(inputs[0].props.value).toBe('腕立て伏せ');
  expect(inputs[inputs.length - 1].props.value).toBe('週2回');
});

test('initial.categoryがEXERCISE_CATEGORIESに存在しない場合、選び直さないと送信できない', async () => {
  const { root, onSubmit } = await renderForm({
    initial: { name: '旧種目', category: '廃止済みカテゴリ', note: '' },
  });

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('カテゴリを選択してください');
});

test('送信失敗後に値を修正すると再送信で onSubmit が呼ばれる', async () => {
  const { root, onSubmit } = await renderForm();

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });
  expect(onSubmit).not.toHaveBeenCalled();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('デッドリフト');
  });
  const backChip = findButtonByLabel(root, '背中')!;
  await act(async () => {
    backChip.props.onPress();
  });

  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'デッドリフト',
    category: 'back',
    note: null,
    favorite: false,
    muscle: null,
    formPoints: [],
  });
});

test('送信失敗後、送信ボタンは disabled になる', async () => {
  const { root } = await renderForm();

  const submitBtn = findButtonByLabel(root, '追加')!;
  expect(submitBtn.props.disabled).toBe(false);

  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(findButtonByLabel(root, '追加')!.props.disabled).toBe(true);
});

test('favoriteスイッチをONにして送信すると favorite: true で onSubmit が呼ばれる', async () => {
  const { root, onSubmit } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });
  const favoriteSwitch = root.findByType(Switch);
  await act(async () => {
    favoriteSwitch.props.onValueChange(true);
  });

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: true,
    muscle: null,
    formPoints: [],
  });
});

test('initial.favorite=true のとき Switch の初期値が true になる', async () => {
  const { root } = await renderForm({
    initial: { name: 'ベンチプレス', category: 'chest', favorite: true },
  });

  expect(root.findByType(Switch).props.value).toBe(true);
});

test('ref経由の submit() でもバリデーション・送信が実行される', async () => {
  const ref = React.createRef<ExerciseFormHandle>();
  const onSubmit = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(
      React.createElement(ExerciseForm, { ref, onSubmit, onCancel: jest.fn() }),
    );
  });

  const [nameInput] = getInputs(instance.root);
  await act(async () => {
    nameInput.props.onChangeText('スクワット');
  });
  const legChip = findButtonByLabel(instance.root, '脚')!;
  await act(async () => {
    legChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'スクワット',
    category: 'leg',
    note: null,
    favorite: false,
    muscle: null,
    formPoints: [],
  });
});

test('使う筋肉とフォームのポイントを入力して送信すると、空欄を除いたtrim済みの値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit } = await renderForm();

  const [nameInput, muscleInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });
  await act(async () => {
    muscleInput.props.onChangeText('  大胸筋・三角筋前部  ');
  });

  const addPointBtn = findButtonByLabel(root, '＋ ポイントを追加')!;
  await act(async () => {
    addPointBtn.props.onPress();
  });

  const pointInputs = getInputs(root).slice(2, 4);
  await act(async () => {
    pointInputs[0].props.onChangeText('  肩甲骨を寄せる  ');
  });
  await act(async () => {
    pointInputs[1].props.onChangeText('   ');
  });

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    muscle: '大胸筋・三角筋前部',
    formPoints: ['肩甲骨を寄せる'],
  });
});

test('フォームのポイントの削除ボタンで該当行が取り除かれる', async () => {
  const { root, onSubmit } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  const addPointBtn = findButtonByLabel(root, '＋ ポイントを追加')!;
  await act(async () => {
    addPointBtn.props.onPress();
  });

  const pointInputs = getInputs(root).slice(2, 4);
  await act(async () => {
    pointInputs[0].props.onChangeText('1つ目');
  });
  await act(async () => {
    pointInputs[1].props.onChangeText('2つ目');
  });

  const removeFirstBtn = root.findByProps({ accessibilityLabel: 'ポイント1を削除' });
  await act(async () => {
    removeFirstBtn.props.onPress();
  });

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    muscle: null,
    formPoints: ['2つ目'],
  });
});

test('編集モード: initialのmuscle・formPointsがフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: {
      name: 'ベンチプレス',
      category: 'chest',
      muscle: '大胸筋',
      formPoints: ['ポイントA', 'ポイントB'],
    },
    submitLabel: '保存',
  });

  const [, muscleInput] = getInputs(root);
  expect(muscleInput.props.value).toBe('大胸筋');

  const pointInputs = getInputs(root).slice(2, 4);
  expect(pointInputs[0].props.value).toBe('ポイントA');
  expect(pointInputs[1].props.value).toBe('ポイントB');
});

test('showFooter=false のとき内蔵のキャンセル/送信ボタンは描画されない', async () => {
  const { root } = await renderForm({ showFooter: false });

  expect(findButtonByLabel(root, '追加')).toBeUndefined();
  expect(findButtonByLabel(root, 'キャンセル')).toBeUndefined();
});

test('onSubmitDisabledChange が初期はfalse、送信失敗後にtrueで呼ばれる', async () => {
  const onSubmitDisabledChange = jest.fn();
  const { root } = await renderForm({ onSubmitDisabledChange });

  expect(onSubmitDisabledChange).toHaveBeenCalledWith(false);

  const submitBtn = findButtonByLabel(root, '追加')!;
  await act(async () => {
    await submitBtn.props.onPress();
  });

  expect(onSubmitDisabledChange).toHaveBeenLastCalledWith(true);
});
