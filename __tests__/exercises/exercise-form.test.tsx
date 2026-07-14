const mockScrollToFirstError = jest.fn();

jest.mock('@/components/ui/form-scroll-context', () => ({
  useScrollToFirstError: () => mockScrollToFirstError,
  // FormFieldが内部で呼ぶ。このテストでは自動スクロールの位置登録自体は検証対象外のためno-opでよい
  useFormScrollRegistration: () => {},
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { Switch } from '@/components/ui/switch';
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
  const ref = React.createRef<ExerciseFormHandle>();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExerciseForm, { ref, onSubmit, ...props }));
  });
  return { root: instance.root, onSubmit, ref };
}

test('未入力で送信するとバリデーションエラーが表示され onSubmit は呼ばれない', async () => {
  const { root, onSubmit, ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
  });

  const texts = allTexts(root);
  expect(texts).toContain('種目名を入力してください');
  expect(texts).toContain('カテゴリを選択してください');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('未入力で送信するとscrollToFirstErrorがエラーのフィールド名付きで呼ばれる(自動スクロール機能の配線確認)', async () => {
  mockScrollToFirstError.mockClear();
  const { ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
  });

  // react-hook-formのonInvalidは(errors, event)の2引数で呼ばれるため、1つ目の引数だけ見る
  expect(mockScrollToFirstError.mock.calls[0][0]).toEqual(
    expect.objectContaining({ name: expect.anything(), category: expect.anything() }),
  );
});

test('有効な値で送信が成功した場合はscrollToFirstErrorは呼ばれない', async () => {
  mockScrollToFirstError.mockClear();
  const { root, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(mockScrollToFirstError).not.toHaveBeenCalled();
});

test('name・categoryを入力して送信すると trim・null化された値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('  ベンチプレス  ');
  });

  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    formPoints: [],
  });
});

test('編集モード: initialの値がフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: { name: '腕立て伏せ', category: 'chest', note: '週2回' },
  });

  const inputs = getInputs(root);
  expect(inputs[0].props.value).toBe('腕立て伏せ');
  expect(inputs[inputs.length - 1].props.value).toBe('週2回');
});

test('initial.categoryがEXERCISE_CATEGORIESに存在しない場合、選び直さないと送信できない', async () => {
  const { root, onSubmit, ref } = await renderForm({
    initial: { name: '旧種目', category: '廃止済みカテゴリ', note: '' },
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('カテゴリを選択してください');
});

test('送信失敗後に値を修正すると再送信で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
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
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'デッドリフト',
    category: 'back',
    note: null,
    favorite: false,
    formPoints: [],
  });
});

test('favoriteスイッチをONにして送信すると favorite: true で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

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

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: true,
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
    instance = create(React.createElement(ExerciseForm, { ref, onSubmit }));
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
    formPoints: [],
  });
});

test('フォームのポイントを入力して送信すると、空欄を除いたtrim済みの値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

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

  const pointInputs = getInputs(root).slice(1, 3);
  await act(async () => {
    pointInputs[0].props.onChangeText('  肩甲骨を寄せる  ');
  });
  await act(async () => {
    pointInputs[1].props.onChangeText('   ');
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    formPoints: ['肩甲骨を寄せる'],
  });
});

test('フォームのポイントの削除ボタンで該当行が取り除かれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

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

  const pointInputs = getInputs(root).slice(1, 3);
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

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    formPoints: ['2つ目'],
  });
});

test('編集モード: initialのformPointsがフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: {
      name: 'ベンチプレス',
      category: 'chest',
      formPoints: ['ポイントA', 'ポイントB'],
    },
  });

  const pointInputs = getInputs(root).slice(1, 3);
  expect(pointInputs[0].props.value).toBe('ポイントA');
  expect(pointInputs[1].props.value).toBe('ポイントB');
});

test('initial.source=presetのとき、フォームのポイント欄は表示されない（詳細画面でguideしか表示しないため編集不可にする）', async () => {
  const { root, onSubmit, ref } = await renderForm({
    initial: {
      name: 'ベンチプレス',
      category: 'chest',
      source: 'preset',
      formPoints: ['既存のポイント'],
    },
  });

  expect(findButtonByLabel(root, '＋ ポイントを追加')).toBeUndefined();
  // name(0), note(1) の2つのみ。ポイント入力欄は存在しない
  expect(getInputs(root)).toHaveLength(2);

  await act(async () => {
    ref.current!.submit();
  });

  // 非表示のままdefaultValuesが維持され、既存のformPointsが壊されず送信される
  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    formPoints: ['既存のポイント'],
  });
});

test('onSubmitDisabledChange が初期はfalse、送信失敗後にtrueで呼ばれる', async () => {
  const onSubmitDisabledChange = jest.fn();
  const { ref } = await renderForm({ onSubmitDisabledChange });

  expect(onSubmitDisabledChange).toHaveBeenCalledWith(false);

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmitDisabledChange).toHaveBeenLastCalledWith(true);
});

test('focusName() で種目名欄にフォーカスできる', async () => {
  const { root, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  const focusSpy = jest.spyOn(nameInput.instance, 'focus');

  act(() => {
    ref.current!.focusName();
  });

  expect(focusSpy).toHaveBeenCalledTimes(1);
});
