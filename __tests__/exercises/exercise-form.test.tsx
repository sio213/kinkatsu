import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { ExerciseForm } from '@/components/exercises/exercise-form';

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

  const [nameInput, noteInput] = getInputs(root);
  expect(nameInput.props.value).toBe('腕立て伏せ');
  expect(noteInput.props.value).toBe('週2回');
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
